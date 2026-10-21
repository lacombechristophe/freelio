import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/pdf/generator", () => ({ generatePdfFromHtml: vi.fn(() => { throw new Error("Native PDF forbidden in this SQL fixture") }), inlinePdfFonts: vi.fn(async (html: string) => html) }))
import prisma from "@/lib/prisma"
import { createCustomerOrder, createDeliveryNote, signDeliveryNote } from "@/actions/operations"
import { GET as deliveryPreview } from "@/app/api/pdf/livraison/[id]/route"
import { inlinePdfFonts } from "@/lib/pdf/generator"

describe.sequential("Customer orders and delivery seals on real SQL", () => {
  let memberId: string, foreignCompanyId: string, agencyId: string, otherAgencyId: string, clientId: string, foreignClientId: string
  let projectId: string, supplierId: string, foreignSupplierId: string, productId: string, foreignProductId: string, sequence = 0
  const input = () => ({ clientId, projectId, productId, label: "Fictional ordered goods", quantity: 3, unitPriceCents: 100, tvaRate: 20 })
  async function seed() {
    const order = await prisma.customerOrder.create({ data: { companyId: session.companyId, clientId, projectId, number: `DELIVERY-${++sequence}`, status: "CONFIRMED", totalHtCents: 300,
      lines: { create: { productId, label: "Original fictional delivery", quantity: 3, deliveredQuantity: 1, unitPriceCents: 100 } },
    }, include: { lines: true } })
    const note = await prisma.deliveryNote.create({ data: { companyId: session.companyId, customerOrderId: order.id, projectId, number: `NOTE-${sequence}`, status: "DELIVERED", deliveredAt: new Date("2030-01-02T12:00:00Z"),
      lines: { create: { customerOrderLineId: order.lines[0].id, productId, label: "Original fictional delivery", quantity: 1 } },
    }, include: { lines: true } })
    return { order, note, line: order.lines[0] }
  }
  const deliver = (f: Awaited<ReturnType<typeof seed>>, quantity = 1) => createDeliveryNote({ customerOrderId: f.order.id, customerOrderLineId: f.line.id, quantity })
  const sign = (id: string) => signDeliveryNote({ deliveryNoteId: id, recipientName: "Fictional recipient", customerApproval: true })
  const preview = (id: string) => deliveryPreview(new Request(`https://example.test/api/pdf/livraison/${id}?screen=1`), { params: Promise.resolve({ id }) })
  async function snapshot() {
    return Promise.all([
      prisma.customerOrder.findMany({ where: { companyId: session.companyId }, include: { lines: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
      prisma.deliveryNote.findMany({ where: { companyId: session.companyId }, include: { lines: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }),
      prisma.auditLog.findMany({ where: { userId: session.userId }, orderBy: { id: "asc" } }),
      prisma.stockMovement.count({ where: { companyId: session.companyId } }),
    ])
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Original fictional sender", isTvaApplicable: true, address: "Original fictional sender address" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional company" } })).id
    session.userId = (await prisma.user.create({ data: { email: `delivery-integrity-${randomUUID()}@example.test` } })).id
    memberId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Local agency", code: "LOCAL" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, name: "Other agency", code: "OTHER" } })).id
    await prisma.agencyMembership.create({ data: { membershipId: memberId, agencyId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Original fictional recipient", address: "Original fictional recipient address" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN-DELIVERY-PARTY", address: "FOREIGN-DELIVERY-ADDRESS" } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Local project" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Local supplier" } })).id
    foreignSupplierId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, supplierId, sku: "LOCAL", label: "Local product" } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "Foreign product" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs()
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } }); await prisma.deliveryNote.deleteMany({ where: { companyId: session.companyId } }); await prisma.customerOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId, siteId: null, status: "ACTIVE" } })
    await prisma.customerSite.deleteMany({ where: { companyId: session.companyId } })
    await prisma.product.update({ where: { id: productId }, data: { active: true, supplierId } })
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OWNER" } })
    await prisma.company.update({ where: { id: session.companyId }, data: { name: "Original fictional sender", isTvaApplicable: true } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Original fictional recipient" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, foreignCompanyId] } }
    await prisma.product.deleteMany({ where }); await prisma.supplier.deleteMany({ where }); await prisma.project.deleteMany({ where }); await prisma.client.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  it("creates a coherent order with one audit and exact integer-cent totals", async () => {
    const result = await createCustomerOrder({ ...input(), quantity: 0.333333, unitPriceCents: 100 })
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ totalHtCents: 33, totalTvaCents: 7, totalTtcCents: 40 })
    expect(await prisma.auditLog.count({ where: { userId: session.userId, action: "CREATE_CUSTOMER_ORDER" } })).toBe(1)
  })
  it.each(["foreign supplier", "inactive product", "completed project", "different site client"])("refuses new orders using %s", async kind => {
    if (kind === "foreign supplier") await prisma.product.update({ where: { id: productId }, data: { supplierId: foreignSupplierId } })
    if (kind === "inactive product") await prisma.product.update({ where: { id: productId }, data: { active: false } })
    if (kind === "completed project") await prisma.project.update({ where: { id: projectId }, data: { status: "COMPLETED" } })
    if (kind === "different site client") {
      const other = await prisma.client.create({ data: { companyId: session.companyId, name: "Other site client" } })
      const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: other.id, label: "Other client site", address1: "Fictional other address" } })
      await prisma.project.update({ where: { id: projectId }, data: { siteId: site.id } })
    }
    const before = await snapshot(); await expect(createCustomerOrder(input())).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  for (const operation of ["deliver", "sign", "preview"] as const) {
    it.each(["foreign client", "foreign product", "foreign supplier", "different project client", "different site client"])(`${operation}: rejects %s`, async kind => {
      const f = await seed()
      if (kind === "foreign client") await prisma.customerOrder.update({ where: { id: f.order.id }, data: { clientId: foreignClientId } })
      if (kind === "foreign product") await prisma.customerOrderLine.update({ where: { id: f.line.id }, data: { productId: foreignProductId } })
      if (kind === "foreign supplier") await prisma.product.update({ where: { id: productId }, data: { supplierId: foreignSupplierId } })
      if (kind === "different project client") await prisma.project.update({ where: { id: projectId }, data: { clientId: (await prisma.client.create({ data: { companyId: session.companyId, name: "Other local client" } })).id } })
      if (kind === "different site client") {
        const other = await prisma.client.create({ data: { companyId: session.companyId, name: "Other site client" } })
        const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: other.id, label: "Other client site", address1: "Fictional other address" } })
        await prisma.project.update({ where: { id: projectId }, data: { siteId: site.id } })
      }
      const before = await snapshot()
      if (operation === "preview") { const response = await preview(f.note.id); expect(response.status).toBe(404); expect(await response.text()).not.toContain("FOREIGN-DELIVERY") }
      else await expect(operation === "deliver" ? deliver(f) : sign(f.note.id)).rejects.toThrow()
      expect(await snapshot()).toEqual(before)
    })
  }
  it("preserves completed partial delivery quantities and prevents over-delivery", async () => {
    const f = await seed()
    await deliver(f, 1); await deliver(f, 1)
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: f.order.id }, include: { lines: true } })).toMatchObject({ status: "DELIVERED", lines: [{ deliveredQuantity: 3 }] })
    const before = await snapshot(); await expect(deliver(f, 1)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("keeps decimal deliveries exact across 0.1 and 0.2", async () => {
    const f = await seed()
    await prisma.deliveryNote.delete({ where: { id: f.note.id } })
    await prisma.customerOrderLine.update({ where: { id: f.line.id }, data: { quantity: 0.3, deliveredQuantity: 0 } })
    await deliver(f, 0.1); await deliver(f, 0.2)
    expect(await prisma.customerOrderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({ deliveredQuantity: 0.3 })
  })
  it("does not revive an order canceled during delivery preparation", async () => {
    const f = await seed(), read = prisma.customerOrderLine.findFirst.bind(prisma.customerOrderLine)
    vi.spyOn(prisma.customerOrderLine, "findFirst").mockImplementationOnce((async args => { const row = await read(args); await prisma.customerOrder.update({ where: { id: f.order.id }, data: { status: "CANCELED" } }); return row }) as typeof read)
    await expect(deliver(f)).rejects.toThrow()
    expect(await prisma.customerOrderLine.findUniqueOrThrow({ where: { id: f.line.id } })).toMatchObject({ deliveredQuantity: 1 })
    expect(await prisma.deliveryNote.count({ where: { companyId: session.companyId } })).toBe(1)
  })
  it("rejects a delivery line belonging to another order when sealing or previewing", async () => {
    const f = await seed(), other = await seed()
    await prisma.deliveryNoteLine.update({ where: { id: f.note.lines[0].id }, data: { customerOrderLineId: other.line.id } })
    const before = await snapshot(); await expect(sign(f.note.id)).rejects.toThrow(); expect((await preview(f.note.id)).status).toBe(404); expect(await snapshot()).toEqual(before)
  })
  it("keeps the signed document identical after current identities and lines change", async () => {
    const f = await seed()
    await sign(f.note.id)
    const original = await (await preview(f.note.id)).text()
    await prisma.company.update({ where: { id: session.companyId }, data: { name: "Changed sender" } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Changed recipient" } })
    await prisma.deliveryNoteLine.update({ where: { id: f.note.lines[0].id }, data: { label: "Changed current line", quantity: 2 } })
    expect(await (await preview(f.note.id)).text()).toBe(original)
  })
  it("refuses to regenerate a historical signed note without a captured document", async () => {
    const f = await seed()
    await prisma.deliveryNote.update({ where: { id: f.note.id }, data: { status: "SIGNED", signedAt: new Date(), signatureSha256: "a".repeat(64) } })
    const response = await preview(f.note.id)
    expect(response.status).toBe(409); expect(await response.text()).toContain("Archive historique indisponible")
  })
  it("uses the company's exemption rather than the supplied VAT rate", async () => {
    await prisma.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false } })
    const result = await createCustomerOrder({ ...input(), quantity: 0.333333 })
    expect(await prisma.customerOrder.findUniqueOrThrow({ where: { id: result.id }, include: { lines: true } })).toMatchObject({ totalHtCents: 33, totalTvaCents: 0, totalTtcCents: 33, lines: [{ tvaRate: 0 }] })
  })
  it("refuses unrepresentable order totals before creating a line or audit", async () => {
    const before = await snapshot()
    await expect(createCustomerOrder({ ...input(), quantity: 1_000_000, unitPriceCents: 2_000_000_000 })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it.each(["create", "deliver", "sign"])("%s: rolls back when its audit insertion is refused", async operation => {
    const f = await seed(), before = await snapshot(), sqlite = process.env.DATABASE_URL?.startsWith("file:")
    const action = { create: "CREATE_CUSTOMER_ORDER", deliver: "CREATE_DELIVERY_NOTE", sign: "SIGN_DELIVERY_NOTE" }[operation]!
    if (sqlite) await prisma.$executeRawUnsafe(`CREATE TRIGGER "fictional_delivery_audit" BEFORE INSERT ON "AuditLog" WHEN NEW."action" = '${action}' BEGIN SELECT RAISE(ABORT, 'Fictional audit failure'); END`)
    else {
      await prisma.$executeRawUnsafe(`CREATE FUNCTION fictional_delivery_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Fictional audit failure'; END; $$ LANGUAGE plpgsql`)
      await prisma.$executeRawUnsafe(`CREATE TRIGGER fictional_delivery_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW WHEN (NEW."action" = '${action}') EXECUTE FUNCTION fictional_delivery_audit()`)
    }
    try { await expect(operation === "create" ? createCustomerOrder(input()) : operation === "deliver" ? deliver(f) : sign(f.note.id)).rejects.toThrow(); expect(await snapshot()).toEqual(before) }
    finally {
      if (sqlite) await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_delivery_audit"')
      else { await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fictional_delivery_audit ON "AuditLog"'); await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_delivery_audit()') }
    }
  })
  it("rejects a recipient change while retaining an identical signature replay", async () => {
    const f = await seed()
    const result = await sign(f.note.id), before = await snapshot()
    expect(await sign(f.note.id)).toMatchObject({ alreadySigned: true, signatureSha256: result.signatureSha256 })
    await expect(signDeliveryNote({ deliveryNoteId: f.note.id, recipientName: "Another recipient", customerApproval: true })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it("rejects a modified encrypted document and never regenerates it", async () => {
    const f = await seed(); await sign(f.note.id)
    await prisma.deliveryNote.update({ where: { id: f.note.id }, data: { signedDocument: "invalid-ciphertext" } })
    expect((await preview(f.note.id)).status).toBe(409)
  })
  it("does not serialize encrypted document contents into the dashboard", async () => {
    const f = await seed(); await sign(f.note.id)
    const { getOperationsDashboard } = await import("@/actions/operations")
    const shown = (await getOperationsDashboard()).deliveryNotes.find(note => note.id === f.note.id)!
    expect(shown).toMatchObject({ sealVersion: 1 }); expect(shown).not.toHaveProperty("signedDocument")
  })
  it.each(["VIEWER", "ACCOUNTING"])("keeps writes forbidden to %s before business reads", async role => {
    const f = await seed(); await prisma.membership.update({ where: { id: memberId }, data: { role } })
    const before = await snapshot()
    await expect(createCustomerOrder(input())).rejects.toThrow("droits nécessaires")
    await expect(deliver(f)).rejects.toThrow("droits nécessaires"); await expect(sign(f.note.id)).rejects.toThrow("droits nécessaires")
    expect(await snapshot()).toEqual(before)
  })
  it("retains read-only demo access and revokes all inaccessible agency reads", async () => {
    const f = await seed(); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await preview(f.note.id)).status).toBe(200)
    await expect(deliver(f)).rejects.toThrow("lecture seule"); await expect(sign(f.note.id)).rejects.toThrow("lecture seule")
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: memberId }, data: { role: "OPERATIONS" } })
    await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
    expect((await preview(f.note.id)).status).toBe(404); await expect(deliver(f)).rejects.toThrow(); await expect(sign(f.note.id)).rejects.toThrow()
  })
  it("rejects a line edited during document preparation and preserves that edit", async () => {
    const f = await seed()
    vi.mocked(inlinePdfFonts).mockImplementationOnce(async html => {
      await prisma.deliveryNoteLine.update({ where: { id: f.note.lines[0].id }, data: { label: "Legitimate concurrent line" } })
      return html
    })
    await expect(sign(f.note.id)).rejects.toThrow("a changé")
    expect(await prisma.deliveryNote.findUniqueOrThrow({ where: { id: f.note.id }, include: { lines: true } })).toMatchObject({ status: "DELIVERED", signedAt: null, signedDocument: null, lines: [{ label: "Legitimate concurrent line" }] })
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("keeps small delivery quantities visible instead of printing zero", async () => {
    const f = await seed()
    await prisma.deliveryNoteLine.update({ where: { id: f.note.lines[0].id }, data: { quantity: 0.0001 } })
    expect(await (await preview(f.note.id)).text()).toContain("<td>0,0001</td>")
  })
  it("refuses a valid encrypted capture copied from another note together with its hash", async () => {
    const f = await seed(), other = await seed()
    await sign(f.note.id); await sign(other.note.id)
    const original = await prisma.deliveryNote.findUniqueOrThrow({ where: { id: f.note.id } })
    await prisma.deliveryNote.update({ where: { id: other.note.id }, data: { signedDocument: original.signedDocument, signatureSha256: original.signatureSha256, signedAt: original.signedAt } })
    expect((await preview(other.note.id)).status).toBe(409)
    expect((await preview(f.note.id)).status).toBe(200)
  })
  it.each(["2030-02-31", "2031-02-29T12:00:00Z", "not-a-date"])("refuses an impossible installation date: %s", async expectedInstallationAt => {
    const before = await snapshot()
    await expect(createCustomerOrder({ ...input(), expectedInstallationAt })).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
})
