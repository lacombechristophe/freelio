import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
// Archive invocation is tested; rendering and remote storage are excluded.
vi.mock("@/lib/finance/issued-invoice", () => ({ prepareIssuedInvoice: vi.fn(async () => ({ issuedDocument: "fictional-snapshot", pdfUrl: "fictional-archive", pdfHash: "fictional-hash" })), discardIssuedInvoice: vi.fn() }))
import prisma from "@/lib/prisma"
import { createCreditNote } from "@/actions/factures"
import { prepareIssuedInvoice } from "@/lib/finance/issued-invoice"

describe.sequential("credit notes preserve the persisted refundable amount", () => {
  let invoiceId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional credit concurrency" } })).id
    session.userId = (await prisma.user.create({ data: { email: `credit-concurrency-${randomUUID()}@example.test` } })).id
    await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Credit customer" } })
    invoiceId = (await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, number: "CREDIT-SOURCE", object: "Fictional source", status: "SENT", dueDate: new Date("2030-01-01"), totalHtCents: 200, totalTvaCents: 0, totalTtcCents: 200 } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    await prisma.creditNote.deleteMany({ where: { invoiceId } })
    await prisma.invoice.deleteMany({ where: { originalInvoiceId: invoiceId } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function assertCredits() {
    const credits = await prisma.invoice.findMany({ where: { originalInvoiceId: invoiceId } })
    const records = await prisma.creditNote.findMany({ where: { invoiceId } })
    const audits = await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_CREDIT_NOTE" } })
    const sum = credits.reduce((total, credit) => total + Math.abs(credit.totalTtcCents), 0)
    expect(sum).toBeGreaterThan(0)
    expect(sum).toBeLessThanOrEqual(200)
    expect(records.reduce((total, credit) => total + credit.amountCents, 0)).toBe(sum)
    expect(records).toHaveLength(credits.length)
    expect(audits).toBe(credits.length)
    for (const credit of credits) expect(credit).toMatchObject({ status: "SENT", type: "CREDIT_NOTE", pdfHash: "fictional-hash" })
    return credits
  }
  it.each([100, 200])("caps concurrent %i-cent credits at the source amount", async amountCents => {
    let release!: () => void
    const wait = new Promise<void>(resolve => { release = resolve })
    const versions: Date[] = []
    const deadline = setTimeout(release, 2000)
    if (process.env.DATABASE_URL?.startsWith("postgres")) {
      const find = prisma.invoice.findFirst.bind(prisma.invoice)
      vi.spyOn(prisma.invoice, "findFirst").mockImplementation((async (...args: Parameters<typeof find>) => {
        const value = await find(...args)
        if (value?.id === invoiceId && versions.length < 2) {
          versions.push(value.updatedAt)
          if (versions.length === 2) release()
          await wait
        }
        return value
      }) as typeof prisma.invoice.findFirst)
    }
    try {
      const results = await Promise.allSettled([0, 1].map(index => createCreditNote({ invoiceId, amountCents, reason: `Fictitious concurrent credit ${index}` })))
      if (process.env.DATABASE_URL?.startsWith("postgres")) {
        expect(versions).toHaveLength(2)
        expect(versions[0]).toEqual(versions[1])
      }
      expect(results.some(result => result.status === "fulfilled")).toBe(true)
      for (const result of results) if (result.status === "rejected") expect(result.reason).toMatchObject({ message: expect.stringMatching(/La facture a reçu une autre opération|Le montant de l'avoir dépasse/) })
      const credits = await assertCredits()
      expect(credits).toHaveLength(results.filter(result => result.status === "fulfilled").length)
      if (amountCents === 200) expect(credits).toHaveLength(1)
    } finally { release(); clearTimeout(deadline) }
  })
  it("refuses a credit beyond the amount remaining after a first credit", async () => {
    await createCreditNote({ invoiceId, amountCents: 100, reason: "Fictitious first credit" })
    await expect(createCreditNote({ invoiceId, amountCents: 200, reason: "Fictitious excessive credit" })).rejects.toThrow("Le montant de l'avoir dépasse")
    expect(await assertCredits()).toHaveLength(1)
  })
  it("rolls back a failed archive and permits a clean retry", async () => {
    const original = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    vi.mocked(prepareIssuedInvoice).mockRejectedValueOnce(new Error("Fictitious archive unavailable"))
    await expect(createCreditNote({ invoiceId, amountCents: 200, reason: "Fictitious failed archive" })).rejects.toThrow("Fictitious archive unavailable")
    expect(await prisma.invoice.count({ where: { originalInvoiceId: invoiceId } })).toBe(0)
    expect(await prisma.creditNote.count({ where: { invoiceId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).updatedAt).toEqual(original.updatedAt)
    await createCreditNote({ invoiceId, amountCents: 200, reason: "Fictitious archive retry" })
    expect(await assertCredits()).toHaveLength(1)
  })
})
