import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createContractFromQuote, getQuoteById } from "@/actions/devis"
import * as numbering from "@/lib/document-numbering"
import { convertQuoteToCustomerOrder } from "@/actions/operations"
import { requestContext } from "@/lib/context"

const create = createContractFromQuote

describe.sequential("Accepted quote contract keeps the displayed source and mandatory audit", () => {
  let membershipId: string, clientId: string, projectId: string, quoteId: string
  let sequence = 0
  const displayed = async () => {
    const quote = await getQuoteById(quoteId)
    expect(quote?.contractConversionRevision).toMatch(/^[a-f0-9]{64}$/)
    return { quoteId, revision: quote!.contractConversionRevision }
  }
  const convert = async () => { const input = await displayed(); return create(input.quoteId, input.revision) }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional quote contract conversion" } })).id
    session.userId = (await prisma.user.create({ data: { email: `quote-contract-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "CONTRACT", name: "Fictional contract agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: agency.id } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional contract client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: "Fictional contract project" } })).id
  })
  beforeEach(async () => {
    quoteId = (await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId, number: `FICTIONAL-CONTRACT-${++sequence}`, object: "Fictional accepted contract work", status: "ACCEPTED", currentVersion: 1, validUntil: new Date("2030-05-01T12:00:00Z"),
      versions: { create: { version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000,
        sections: { create: { lines: { create: { label: "Fictional agreed scope", quantity: 1, unitPriceCents: 10000, tvaRate: 20 } } } },
      } },
    } })).id
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_quote_contract_audit_failure"')
    else {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_quote_contract_audit_failure" ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_quote_contract_audit_failure()')
    }
  }
  async function failAudit() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_quote_contract_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' AND NEW."action" = 'CREATE_CONTRACT' BEGIN SELECT RAISE(ABORT, 'Fictional contract audit failure'); END`)
    else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_quote_contract_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' AND NEW."action" = 'CREATE_CONTRACT' THEN RAISE EXCEPTION 'Fictional contract audit failure'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_quote_contract_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_quote_contract_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); await dropTrigger()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.contract.deleteMany({ where: { companyId: session.companyId } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.quote.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId, id: { not: projectId } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
  })
  afterAll(async () => {
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("prepares an own draft contract for Commercial and journals it once", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const result = await convert()
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ companyId: session.companyId, clientId, sourceQuoteId: quoteId, status: "DRAFT" })
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_CONTRACT" } })).toBe(1)
  })
  it("does not keep a draft contract when its mandatory audit is refused", async () => {
    await failAudit()
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
  })
  it("does not take a newer version instead of the accepted current version", async () => {
    await prisma.quoteVersion.create({ data: { quoteId, version: 2, totalHtCents: 20000, totalTvaCents: 4000, totalTtcCents: 24000,
      sections: { create: { lines: { create: { label: "Fictional replacement scope", quantity: 1, unitPriceCents: 20000, tvaRate: 20 } } } },
    } })
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
  })
  it("rechecks acceptance after number preparation before creating the contract", async () => {
    const original = numbering.readCompanyDocumentNumbers
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      await prisma.quote.update({ where: { id: quoteId }, data: { status: "REJECTED" } })
      return result
    })
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe("REJECTED")
    expect(result).toBe("refused")
  })
  it("refuses the stale displayed contract source including its validity date", async () => {
    const input = await displayed()
    await prisma.quote.update({ where: { id: quoteId }, data: { validUntil: new Date("2030-06-01T12:00:00Z") } })
    const result = await create(input.quoteId, input.revision).then(() => "accepted", () => "refused")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
  })
  it("returns a concurrent coherent contract without claiming a second creation audit", async () => {
    const original = numbering.readCompanyDocumentNumbers
    let concurrentId = ""
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      concurrentId = (await prisma.contract.create({ data: { companyId: session.companyId, clientId, sourceQuoteId: quoteId, number: "CONT-FICTIONAL-CONCURRENT", title: "Fictional existing draft", content: "Fictional unchanged content" } })).id
      return result
    })
    expect((await convert()).id).toBe(concurrentId)
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_CONTRACT" } })).toBe(0)
  })
  it("preserves the proposed content and validity and returns no signing credential", async () => {
    const input = await displayed(), result = await create(input.quoteId, input.revision)
    expect(Object.keys(result).sort()).toEqual(["id", "number"])
    const contract = await prisma.contract.findUniqueOrThrow({ where: { id: result.id } })
    expect(contract.validUntil?.toISOString()).toBe("2030-05-01T12:00:00.000Z")
    expect(contract.content).toContain("Fictional agreed scope")
    expect(contract.content).toContain("120,00")
    expect((await prisma.auditLog.findFirstOrThrow({ where: { userId: session.userId } })).payload).toMatchObject({ fromQuote: quoteId, version: 1, sourceRevision: input.revision, number: result.number })
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["DRAFT", "SIGNED"])("returns an existing %s contract without rewriting content or another audit", async status => {
    const result = await convert()
    await prisma.contract.update({ where: { id: result.id }, data: { status, content: "Fictional preserved historical content" } })
    const before = await prisma.contract.findUniqueOrThrow({ where: { id: result.id } })
    expect((await create(quoteId)).id).toBe(result.id)
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: result.id } })).toEqual(before)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
  it("refuses duplicate current versions before preparing a draft", async () => {
    await prisma.quoteVersion.create({ data: { quoteId, version: 1, totalHtCents: 10000, totalTvaCents: 2000, totalTtcCents: 12000 } })
    await expect(convert()).rejects.toThrow("version acceptée")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each([undefined, "a".repeat(64)])("refuses a new contract without its displayed revision %s", async revision => {
    await expect(create(quoteId, revision)).rejects.toThrow("Le devis a changé")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["DRAFT", "SENT", "REJECTED", "EXPIRED"])("does not prepare a contract from a %s quote", async status => {
    await prisma.quote.update({ where: { id: quoteId }, data: { status } })
    await expect(convert()).rejects.toThrow("doit être accepté")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["OPERATIONS", "ACCOUNTING", "SERVICE", "VIEWER"])("refuses %s before entering the preparation action", async role => {
    const input = await displayed()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const context = vi.spyOn(requestContext, "run")
    await expect(create(quoteId, input.revision)).rejects.toThrow("pas les droits")
    expect(context).not.toHaveBeenCalled()
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("refuses a suspended membership without a draft or audit", async () => {
    const input = await displayed()
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(create(quoteId, input.revision)).rejects.toThrow("plus accès")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("refuses the public read-only demo before entering the action", async () => {
    const input = await displayed()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const context = vi.spyOn(requestContext, "run")
    await expect(create(quoteId, input.revision)).rejects.toThrow("lecture seule")
    expect(context).not.toHaveBeenCalled()
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("preserves a newer scope changed during number preparation and refuses the stale contract", async () => {
    const input = await displayed(), original = numbering.readCompanyDocumentNumbers
    const line = await prisma.quoteLine.findFirstOrThrow({ where: { section: { version: { quoteId } } } })
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      await prisma.quoteLine.update({ where: { id: line.id }, data: { label: "Fictional updated scope" } })
      return result
    })
    await expect(create(quoteId, input.revision)).rejects.toThrow("Le devis a changé")
    expect((await prisma.quoteLine.findUniqueOrThrow({ where: { id: line.id } })).label).toBe("Fictional updated scope")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it.each(["negative", "inconsistent", "overflow"])("refuses %s stored quote totals", async kind => {
    const version = await prisma.quoteVersion.findFirstOrThrow({ where: { quoteId } })
    await prisma.quoteVersion.update({ where: { id: version.id }, data: kind === "negative" ? { totalHtCents: -10000 } : kind === "inconsistent" ? { totalTtcCents: 12001 } : { totalHtCents: 2_147_483_647, totalTvaCents: 1, totalTtcCents: 2_147_483_647 } })
    await expect(convert()).rejects.toThrow("montants du devis")
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("keeps the contract revision valid when order conversion only links a generated project", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    const quote = await getQuoteById(quoteId)
    const order = await convertQuoteToCustomerOrder({ quoteId, expectedRevision: quote!.orderConversionRevision })
    expect((await getQuoteById(quoteId))!.contractConversionRevision).toBe(quote!.contractConversionRevision)
    const contract = await create(quoteId, quote!.contractConversionRevision)
    expect(await prisma.customerOrder.count({ where: { quoteId } })).toBe(1)
    expect(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).toMatchObject({ sourceQuoteId: quoteId })
    expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: order.id } })).projectId).toBeTruthy()
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(3)
  })
  it("preserves a prepared order when contract audit fails and resumes without duplicating either", async () => {
    const quote = await getQuoteById(quoteId)
    const orderInput = { quoteId, expectedRevision: quote!.orderConversionRevision }
    const order = await convertQuoteToCustomerOrder(orderInput)
    await failAudit()
    await expect(create(quoteId, quote!.contractConversionRevision)).rejects.toThrow()
    expect(await prisma.customerOrder.count({ where: { quoteId } })).toBe(1)
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
    await dropTrigger()
    expect(await convertQuoteToCustomerOrder(orderInput)).toMatchObject({ id: order.id, existing: true })
    const contract = await create(quoteId, quote!.contractConversionRevision)
    expect((await create(quoteId)).id).toBe(contract.id)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(2)
  })
  it("prepares one contract and one audit for two same-source callers", async () => {
    const input = await displayed()
    const results = await Promise.all([create(quoteId, input.revision), create(quoteId, input.revision)])
    expect(new Set(results.map(result => result.id)).size).toBe(1)
    expect(await prisma.contract.count({ where: { companyId: session.companyId } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
})
