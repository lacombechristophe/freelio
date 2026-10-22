import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { convertQuoteToCustomerOrder } from "@/actions/operations"
import { getQuoteById } from "@/actions/devis"
import * as numbering from "@/lib/document-numbering"
import { requestContext } from "@/lib/context"
import { withAuth } from "@/lib/auth-wrapper"
import { createCustomerOrder } from "@/actions/operations"

describe.sequential("Accepted quote conversion keeps the source, order, project and audit consistent", () => {
  let membershipId: string, clientId: string, projectId: string, quoteId: string, versionId: string, productId: string
  let sequence = 0
  const displayedInput = async () => {
    const quote = await getQuoteById(quoteId)
    expect(quote?.orderConversionRevision).toMatch(/^[a-f0-9]{64}$/)
    return { quoteId, depositRate: 30, expectedInstallationAt: "2030-02-20", expectedRevision: quote!.orderConversionRevision }
  }
  const convert = async () => convertQuoteToCustomerOrder(await displayedInput())
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional quote conversion", isTvaApplicable: true } })).id
    session.userId = (await prisma.user.create({ data: { email: `quote-conversion-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional conversion agency" } })
    await prisma.agencyMembership.create({ data: { membershipId, agencyId: agency.id } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional accepted quote client" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: "Fictional existing project" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "FICTIONAL-CONVERSION", label: "Fictional quoted product" } })).id
  })
  beforeEach(async () => {
    const quote = await prisma.quote.create({ data: { companyId: session.companyId, clientId, projectId, number: `FICTIONAL-CONVERSION-${++sequence}`, object: "Fictional accepted work", status: "ACCEPTED", acceptedAt: new Date("2030-01-01T12:00:00Z"), currentVersion: 1,
      versions: { create: { version: 1, totalHtCents: 333, totalTvaCents: 67, totalTtcCents: 400,
        sections: { create: { order: 0, lines: { create: { productId, label: "Fictional accepted line", quantity: 0.333333, unitPriceCents: 1000, tvaRate: 20, order: 0 } } } } } },
    }, include: { versions: true } })
    quoteId = quote.id; versionId = quote.versions[0].id
  })
  async function dropTrigger() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_conversion_audit_failure"')
    else {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_conversion_audit_failure" ON "AuditLog"')
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_conversion_audit_failure()')
    }
  }
  async function failAudit() {
    if (process.env.DATABASE_URL?.startsWith("file:")) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_conversion_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' BEGIN SELECT RAISE(ABORT, 'Fictional conversion audit failure'); END`)
    else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_conversion_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' THEN RAISE EXCEPTION 'Fictional conversion audit failure'; END IF; RETURN NEW; END; $$`)
      await prisma.$executeRawUnsafe('CREATE TRIGGER "fictional_conversion_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_conversion_audit_failure()')
    }
  }
  afterEach(async () => {
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); await dropTrigger()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.quote.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId, id: { not: projectId } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.project.update({ where: { id: projectId }, data: { status: "ACTIVE" } })
    await prisma.product.update({ where: { id: productId }, data: { active: true } })
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: true } })
  })
  afterAll(async () => {
    await prisma.product.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("allows Commercial to launch an accepted quote into its existing accessible project", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const result = await convert()
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ quoteId, projectId, clientId, totalTtcCents: 400, depositCents: 120 })
  })
  it("does not keep an order or generated project when the audit is refused", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    await failAudit()
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(1)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).projectId).toBeNull()
    expect(result).toBe("refused")
  })
  it("does not silently take a newer version that is not the accepted current version", async () => {
    await prisma.quoteVersion.create({ data: { quoteId, version: 2, totalHtCents: 1000, totalTvaCents: 200, totalTtcCents: 1200,
      sections: { create: { lines: { create: { label: "Fictional unaccepted replacement", quantity: 1, unitPriceCents: 1000, tvaRate: 20 } } } },
    } })
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
  })
  it("rechecks acceptance after number preparation before creating anything", async () => {
    const original = numbering.readCompanyDocumentNumbers
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      await prisma.quote.update({ where: { id: quoteId }, data: { status: "REJECTED" } })
      return result
    })
    const result = await convert().then(() => "accepted", () => "refused")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).status).toBe("REJECTED")
    expect(result).toBe("refused")
  })
  it("does not create an order from a stale displayed quote revision", async () => {
    const displayed = await displayedInput()
    await prisma.quoteVersion.update({ where: { id: versionId }, data: { totalHtCents: 666, totalTvaCents: 134, totalTtcCents: 800 } })
    const result = await convertQuoteToCustomerOrder(displayed).then(() => "accepted", () => "refused")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(result).toBe("refused")
  })
  it("copies accepted quantities, money, agreement date and source identifiers without repricing", async () => {
    const original = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId }, include: { versions: { include: { sections: { include: { lines: true } } } } } })
    const result = await convert()
    const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id }, include: { lines: true } })
    expect(order).toMatchObject({ quoteId, projectId, clientId, status: "CONFIRMED", billingStatus: "NOT_INVOICED", totalHtCents: 333, totalTvaCents: 67, totalTtcCents: 400, depositCents: 120, acceptedAt: original.acceptedAt, expectedInstallationAt: new Date("2030-02-20T12:00:00Z") })
    expect(order.lines).toHaveLength(1)
    expect(order.lines[0]).toMatchObject({ productId, quantity: 0.333333, deliveredQuantity: 0, unitPriceCents: 1000, sourceKey: `quote:${original.versions[0].sections[0].lines[0].id}` })
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).toMatchObject({ updatedAt: original.updatedAt, projectId })
    const audit = await prisma.auditLog.findMany({ where: { userId: session.userId } })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: "CREATE_CUSTOMER_ORDER", resourceId: order.id, payload: { quoteId, quoteVersionId: versionId, version: 1, projectId, depositCents: 120 } })
    expect(await prisma.invoice.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("creates and journals one project with the order for an agency-unrestricted Owner", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    const result = await convert()
    const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })
    const generated = await prisma.project.findUniqueOrThrow({ where: { id: order.projectId! } })
    expect(generated).toMatchObject({ clientId, companyId: session.companyId, budgetCents: 333, worksiteStage: "COMMANDE_CONFIRMEE" })
    expect((await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).projectId).toBe(generated.id)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: generated.id, action: "CREATE_PROJECT" } })).toBe(1)
    expect(await prisma.auditLog.count({ where: { userId: session.userId, resourceId: order.id, action: "CREATE_CUSTOMER_ORDER" } })).toBe(1)
  })
  it("dates a generated project in the company calendar without a browser timezone dependency", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2030-02-20T23:30:00Z"))
    const result = await convert()
    const order = await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })
    expect((await prisma.project.findUniqueOrThrow({ where: { id: order.projectId! } })).startDate?.toISOString()).toBe("2030-02-21T12:00:00.000Z")
  })
  it("rolls back the order and lines when its audit fails with an existing project", async () => {
    const input = await displayedInput(), before = await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })
    await failAudit()
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow()
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.customerOrderLine.count({ where: { customerOrder: { companyId: session.companyId } } })).toBe(0)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(1)
    expect(await prisma.quote.findUniqueOrThrow({ where: { id: quoteId } })).toEqual(before)
  })
  it("returns the existing dossier after a retry without changing it or creating another audit", async () => {
    const input = await displayedInput(), first = await convertQuoteToCustomerOrder(input)
    const before = await prisma.customerOrder.findUniqueOrThrow({ where: { id: first.id }, include: { lines: true } })
    for (const retry of [input, { quoteId, depositRate: 90, expectedInstallationAt: "2030-05-01" }]) {
      expect(await convertQuoteToCustomerOrder(retry)).toMatchObject({ id: first.id, existing: true })
      expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: first.id }, include: { lines: true } })).toEqual(before)
    }
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
  it("creates only one dossier when two callers launch the same displayed source", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    const input = await displayedInput()
    const results = await Promise.all([convertQuoteToCustomerOrder(input), convertQuoteToCustomerOrder(input)])
    expect(new Set(results.map(result => result.id)).size).toBe(1)
    expect(results.filter(result => result.existing)).toHaveLength(1)
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(1)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(2)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(2)
  })
  it("preserves a catalog product deactivated after quote acceptance", async () => {
    await prisma.product.update({ where: { id: productId }, data: { active: false } })
    const result = await convert()
    expect((await prisma.customerOrderLine.findFirstOrThrow({ where: { customerOrderId: result.id } })).productId).toBe(productId)
  })
  it("preserves accepted tax amounts after the company tax setting changes", async () => {
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false } })
    const result = await convert()
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ totalHtCents: 333, totalTvaCents: 67, totalTtcCents: 400 })
  })
  it("refuses a duplicate current version instead of selecting one arbitrarily", async () => {
    await prisma.quoteVersion.create({ data: { quoteId, version: 1, totalHtCents: 333, totalTvaCents: 67, totalTtcCents: 400 } })
    await expect(convert()).rejects.toThrow("version acceptée")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["DRAFT", "SENT", "REJECTED", "EXPIRED"])("does not launch a %s quote", async status => {
    await prisma.quote.update({ where: { id: quoteId }, data: { status } })
    await expect(convert()).rejects.toThrow("accord du client")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("preserves a source line changed during number preparation and refuses the stale copy", async () => {
    const input = await displayedInput(), original = numbering.readCompanyDocumentNumbers
    const line = await prisma.quoteLine.findFirstOrThrow({ where: { section: { versionId } } })
    vi.spyOn(numbering, "readCompanyDocumentNumbers").mockImplementationOnce(async read => {
      const result = await original(read)
      await prisma.quoteLine.update({ where: { id: line.id }, data: { label: "Fictional newer accepted description" } })
      return result
    })
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow("Le devis a changé")
    expect((await prisma.quoteLine.findUniqueOrThrow({ where: { id: line.id } })).label).toBe("Fictional newer accepted description")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it.each([undefined, "a".repeat(64)])("refuses a new dossier without the valid displayed revision %s", async expectedRevision => {
    await expect(convertQuoteToCustomerOrder({ quoteId, expectedRevision })).rejects.toThrow("Le devis a changé")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["negative", "inconsistent", "overflow"])("does not propagate %s stored quote totals", async kind => {
    await prisma.quoteVersion.update({ where: { id: versionId }, data: kind === "negative" ? { totalHtCents: -333 } : kind === "inconsistent" ? { totalTtcCents: 401 } : { totalHtCents: 2_147_483_647, totalTvaCents: 1, totalTtcCents: 2_147_483_647 } })
    await expect(convert()).rejects.toThrow("montants du devis")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("does not launch into a completed project", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { status: "COMPLETED" } })
    await expect(convert()).rejects.toThrow("chantier n’est plus actif")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it.each(["OPERATIONS", "ACCOUNTING", "SERVICE"])("refuses %s before entering the conversion action", async role => {
    const input = await displayedInput()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const context = vi.spyOn(requestContext, "run")
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow("pas les droits")
    expect(context).not.toHaveBeenCalled()
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("refuses a suspended membership before conversion", async () => {
    const input = await displayedInput()
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow("plus accès")
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("refuses the public read-only demo before entering the action", async () => {
    const input = await displayedInput()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const context = vi.spyOn(requestContext, "run")
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow("lecture seule")
    expect(context).not.toHaveBeenCalled()
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("does not give Commercial general order creation or operational edits after a conversion", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const result = await convert()
    await expect(createCustomerOrder({ clientId, projectId, label: "Fictional direct order", quantity: 1, unitPriceCents: 100 })).rejects.toThrow("pas les droits")
    await expect(withAuth(() => prisma.customerOrder.update({ where: { id: result.id }, data: { totalTtcCents: 1 } }), "sales.write")).rejects.toThrow("FORBIDDEN:operations.write")
    await expect(withAuth(() => prisma.customerOrder.delete({ where: { id: result.id } }), "sales.write")).rejects.toThrow("FORBIDDEN:operations.write")
    await expect(withAuth(() => prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional forbidden project" } }), "sales.write")).rejects.toThrow("FORBIDDEN:operations.write")
    expect((await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })).totalTtcCents).toBe(400)
  })
  it("requires an explicit accessible project for agency-limited Commercial", async () => {
    await prisma.quote.update({ where: { id: quoteId }, data: { projectId: null } })
    const input = await displayedInput()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    await expect(convertQuoteToCustomerOrder(input)).rejects.toThrow()
    expect(await prisma.customerOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.project.count({ where: { companyId: session.companyId } })).toBe(1)
  })
})
