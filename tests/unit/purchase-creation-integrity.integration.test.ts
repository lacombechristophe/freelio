import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createPurchaseOrder } from "@/actions/operations"
import * as operations from "@/actions/operations"
import { createPurchaseDraft } from "@/actions/purchase-drafts"

describe.sequential("Purchase creation checks references after number preparation", () => {
  let otherCompanyId: string, membershipId: string, clientId: string, foreignClientId: string, agencyId: string, otherAgencyId: string
  let projectId: string, badProjectId: string, completedProjectId: string, foreignProjectId: string, unassignedProjectId: string
  let productId: string, foreignProductId: string, inactiveProductId: string, supplierId: string
  const input = (target = projectId, product = productId) => ({ supplierId, projectId: target, lines: [{ productId: product, label: "Fictional manually edited line", quantity: 2, unitPriceCents: 1234 }, { label: "Fictional free line", quantity: 1, unitPriceCents: 300 }] })
  async function snapshot() {
    return Promise.all([
      prisma.purchaseOrder.count({ where: { companyId: session.companyId } }),
      prisma.purchaseOrderLine.count({ where: { purchaseOrder: { companyId: session.companyId } } }),
      prisma.auditLog.count({ where: { userId: session.userId } }),
      prisma.stockMovement.count({ where: { companyId: session.companyId } }),
      prisma.emailDelivery.count({ where: { companyId: session.companyId } }),
      prisma.supplier.findUnique({ where: { id: supplierId }, select: { active: true, updatedAt: true } }),
    ])
  }
  function changeBeforeNumberRead(change: () => Promise<unknown>) {
    const read = prisma.purchaseOrder.findMany.bind(prisma.purchaseOrder)
    const interleaved = (async (args: Parameters<typeof read>[0]) => { await change(); return read(args) }) as typeof read
    vi.spyOn(prisma.purchaseOrder, "findMany").mockImplementationOnce(interleaved)
  }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional purchase creation integrity" } })).id
    otherCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional purchase creation integrity" } })).id
    session.userId = (await prisma.user.create({ data: { email: `purchase-creation-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "PERMITTED", name: "Fictional permitted agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional coherent client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: otherCompanyId, name: "Foreign fictional client" } })).id
    supplierId = (await prisma.supplier.create({ data: { companyId: session.companyId, name: "Fictional coherent supplier" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "COHERENT", label: "Fictional coherent product", purchasePriceCents: 789 } })).id
    foreignProductId = (await prisma.product.create({ data: { companyId: otherCompanyId, sku: "FOREIGN", label: "Foreign fictional product" } })).id
    inactiveProductId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "INACTIVE", label: "Fictional inactive product", active: false } })).id
    projectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, name: "Fictional coherent project" } })).id
    badProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId: foreignClientId, agencyId, name: "Fictional incoherent project" } })).id
    completedProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId, status: "COMPLETED", name: "Fictional completed project" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: otherCompanyId, clientId: foreignClientId, name: "Foreign fictional project" } })).id
    unassignedProjectId = (await prisma.project.create({ data: { companyId: session.companyId, clientId, name: "Fictional unassigned project" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.product.update({ where: { id: productId }, data: { active: true } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId, agencyId, status: "ACTIVE" } })
    await prisma.supplier.update({ where: { id: supplierId }, data: { active: true } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    const where = { companyId: { in: [session.companyId, otherCompanyId] } }
    await prisma.project.deleteMany({ where }); await prisma.product.deleteMany({ where }); await prisma.client.deleteMany({ where }); await prisma.supplier.deleteMany({ where })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, otherCompanyId] } } }); await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN"])("preserves coherent draft creation and edited prices for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const result = await createPurchaseOrder(input())
    expect(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.id }, include: { lines: { orderBy: { order: "asc" } } } })).toMatchObject({ projectId, totalHtCents: 2768, status: "DRAFT", lines: [{ productId, quantity: 2, unitPriceCents: 1234, label: "Fictional manually edited line" }, { productId: null, quantity: 1, unitPriceCents: 300 }] })
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(1)
  })
  it.each(["foreign client", "completed project", "foreign project"])("refuses %s without any new business state", async kind => {
    const before = await snapshot(), target = kind === "foreign client" ? badProjectId : kind === "completed project" ? completedProjectId : foreignProjectId
    await expect(createPurchaseOrder(input(target))).rejects.toThrow("Chantier introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["foreign", "inactive"])("refuses a %s product without any new business state", async kind => {
    const before = await snapshot()
    await expect(createPurchaseOrder(input(projectId, kind === "foreign" ? foreignProductId : inactiveProductId))).rejects.toThrow("Un produit fournisseur est introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it("keeps limited roles inside their agencies", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    const before = await snapshot()
    await expect(createPurchaseOrder(input(unassignedProjectId))).rejects.toThrow("Chantier introuvable")
    await prisma.project.update({ where: { id: projectId }, data: { agencyId: otherAgencyId } })
    await expect(createPurchaseOrder(input())).rejects.toThrow("Chantier introuvable")
    expect(await snapshot()).toEqual(before)
  })
  it.each(["foreign client", "completed project", "other agency", "inactive product"])("rechecks %s after the number is prepared", async kind => {
    if (kind === "other agency") await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    const before = await snapshot()
    changeBeforeNumberRead(() => kind === "inactive product"
      ? prisma.product.update({ where: { id: productId }, data: { active: false } })
      : prisma.project.update({ where: { id: projectId }, data: kind === "foreign client" ? { clientId: foreignClientId } : kind === "completed project" ? { status: "COMPLETED" } : { agencyId: otherAgencyId } }))
    await expect(createPurchaseOrder(input())).rejects.toThrow(kind === "inactive product" ? "Un produit fournisseur est introuvable" : "Chantier introuvable")
    expect(await snapshot()).toEqual(before)
    if (kind === "inactive product") expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).active).toBe(false)
    else expect(await prisma.project.findUniqueOrThrow({ where: { id: projectId } })).toMatchObject(kind === "foreign client" ? { clientId: foreignClientId } : kind === "completed project" ? { status: "COMPLETED" } : { agencyId: otherAgencyId })
  })
  it("keeps supplier deactivation protected and rolls back the whole draft", async () => {
    await prisma.supplier.update({ where: { id: supplierId }, data: { active: false } })
    const before = await snapshot()
    await expect(createPurchaseOrder(input())).rejects.toThrow("Fournisseur introuvable ou inactif")
    expect(await snapshot()).toEqual(before)
  })
  it("preserves a free line and an optional project for the owner", async () => {
    const result = await createPurchaseOrder({ supplierId, lines: [{ label: "Fictional free purchase", quantity: 1, unitPriceCents: 300 }] })
    expect(await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: result.id } })).toMatchObject({ projectId: null, totalHtCents: 300 })
  })
  it.each(["SALES", "SERVICE", "ACCOUNTING", "VIEWER"])("refuses writes by %s before reading business references", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const before = await snapshot(), read = vi.spyOn(prisma.project, "findFirst")
    await expect(createPurchaseOrder(input())).rejects.toThrow("droits")
    expect(read).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before)
  })
  it("refuses public-demo creation without any new business state", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    const before = await snapshot()
    await expect(createPurchaseOrder(input())).rejects.toThrow()
    expect(await snapshot()).toEqual(before)
  })
  it.each(["project", "product"])("returns the expected %s refusal across the Action boundary", async kind => {
    const before = await snapshot()
    expect(await createPurchaseDraft(kind === "project" ? input(badProjectId) : input(projectId, inactiveProductId))).toEqual({ success: false, error: kind === "project" ? "Chantier introuvable" : "Un produit fournisseur est introuvable" })
    expect(await snapshot()).toEqual(before)
  })
  it("leaves unexpected error details to production redaction", async () => {
    const failure = new Error("Fictional private database detail")
    vi.spyOn(operations, "createPurchaseOrder").mockRejectedValueOnce(failure)
    await expect(createPurchaseDraft(input())).rejects.toBe(failure)
  })
})
