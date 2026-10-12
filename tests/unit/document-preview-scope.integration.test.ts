import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: vi.fn(() => { throw new Error("No PDF generator allowed in the scope fixture") }), embedFacturX: vi.fn() }))
import { generatePdfFromHtml } from "@/lib/pdf/generator"
import prisma from "@/lib/prisma"
import { GET as invoicePreview } from "@/app/api/pdf/facture/[id]/route"
import { GET as quotePreview } from "@/app/api/pdf/devis/[id]/route"

describe.sequential("Authenticated document preview client scope on real SQL", () => {
  let foreignCompanyId: string, membershipId: string, agencyId: string, localInvoiceId: string, foreignClientInvoiceId: string, localQuoteId: string, foreignClientQuoteId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional preview diagnosis", isTvaApplicable: false } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign preview diagnosis" } })).id
    session.userId = (await prisma.user.create({ data: { email: `pdf-tenant-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "OWN", name: "Fictional preview agency" } })
    agencyId = agency.id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: agency.id } })
    const own = await prisma.client.create({ data: { companyId: session.companyId, name: "FICTIONAL-OWN-PREVIEW-PARTY" } })
    const foreign = await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FICTIONAL-FOREIGN-PREVIEW-PARTY", address: "Fictional private foreign address" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: own.id, agencyId: agency.id, name: "Fictional preview project" } })
    for (const [clientId, marker] of [[own.id, "OWN"], [foreign.id, "FOREIGN"]]) {
      const invoice = await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: marker, object: "Fictional preview invoice", dueDate: new Date("2030-02-01"), totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000, lines: { create: { label: "Fictional line", quantity: 1, unitPriceCents: 10000, tvaRate: 0 } } } })
      const quote = await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: marker, object: "Fictional preview quote", versions: { create: { version: 1, totalHtCents: 10000, totalTvaCents: 0, totalTtcCents: 10000, sections: { create: { title: "Fictional section", lines: { create: { label: "Fictional line", quantity: 1, unitPriceCents: 10000, tvaRate: 0 } } } } } } } })
      if (marker === "OWN") { localInvoiceId = invoice.id; localQuoteId = quote.id }
      else { foreignClientInvoiceId = invoice.id; foreignClientQuoteId = quote.id }
    }
  })
  afterEach(async () => {
    vi.clearAllMocks()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.invoice.update({ where: { id: foreignClientInvoiceId }, data: { status: "DRAFT", lockedAt: null } })
  })
  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } }); await prisma.quote.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } }); await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  const preview = (kind: string, id: string) => (kind === "invoice" ? invoicePreview : quotePreview)(new Request(`https://example.test/api/pdf/${kind}/${id}?screen=1`), { params: Promise.resolve({ id }) })
  it.each([["invoice", "OWNER"], ["invoice", "ACCOUNTING"], ["quote", "OWNER"], ["quote", "SALES"]])("refuses a foreign client in the %s preview for %s", async (kind, role) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const response = await preview(kind, kind === "invoice" ? foreignClientInvoiceId : foreignClientQuoteId)
    expect(response.status).toBe(404)
    const body = await response.text(); expect(body).not.toContain("FICTIONAL-FOREIGN-PREVIEW-PARTY"); expect(body).not.toContain("Fictional private foreign address")
  })
  it.each(["invoice", "quote"])("keeps the coherent %s preview as a positive control", async kind => {
    const response = await preview(kind, kind === "invoice" ? localInvoiceId : localQuoteId)
    expect(response.status).toBe(200); const html = await response.text()
    expect(html).toContain("FICTIONAL-OWN-PREVIEW-PARTY"); expect(html).not.toContain("FICTIONAL-FOREIGN-PREVIEW-PARTY")
  })
  for (const kind of ["invoice", "quote"]) {
    it.each(["OWNER", "ADMIN", "SALES", "OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])(`keeps the ${kind} read policy for %s`, async role => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role } })
      const allowed = kind === "invoice" ? ["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"].includes(role) : ["OWNER", "ADMIN", "SALES", "OPERATIONS", "ACCOUNTING", "VIEWER"].includes(role)
      const response = await preview(kind, kind === "invoice" ? localInvoiceId : localQuoteId)
      expect(response.status).toBe(allowed ? 200 : 403)
      if (!allowed) expect(await response.text()).not.toContain("FICTIONAL-OWN-PREVIEW-PARTY")
    })
    it(`denies a revoked agency in the ${kind} preview`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { role: kind === "invoice" ? "ACCOUNTING" : "SALES" } })
      await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
      try { expect((await preview(kind, kind === "invoice" ? localInvoiceId : localQuoteId)).status).toBe(404) }
      finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
    })
    it(`denies a suspended membership in the ${kind} preview`, async () => {
      await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
      expect((await preview(kind, kind === "invoice" ? localInvoiceId : localQuoteId)).status).toBe(401)
    })
    it(`refuses a foreign client before the ${kind} binary generator`, async () => {
      const id = kind === "invoice" ? foreignClientInvoiceId : foreignClientQuoteId
      const response = await (kind === "invoice" ? invoicePreview : quotePreview)(new Request(`https://example.test/api/pdf/${kind}/${id}`), { params: Promise.resolve({ id }) })
      expect(response.status).toBe(404); expect(generatePdfFromHtml).not.toHaveBeenCalled()
    })
  }
  it("refuses a foreign client before accessing an issued invoice archive", async () => {
    await prisma.invoice.update({ where: { id: foreignClientInvoiceId }, data: { status: "SENT", lockedAt: new Date("2030-01-01") } })
    expect((await preview("invoice", foreignClientInvoiceId)).status).toBe(404)
    expect(generatePdfFromHtml).not.toHaveBeenCalled()
  })
})
