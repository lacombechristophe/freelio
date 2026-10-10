import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getSupplierDirectory, getSupplierChoices, updateSupplier, setSupplierActive } from "@/actions/suppliers"
import { createSupplier, createProduct, createPurchaseOrder } from "@/actions/operations"
import { createCatalogProduct, updateCatalogProduct } from "@/actions/products"

describe.sequential("supplier management on the isolated database", () => {
  let supplierId: string, foreignId: string, foreignCompanyId: string, membershipId: string, productId: string
  const productData = (supplier: string | null) => ({ sku: `SUP-${randomUUID()}`, label: "Fictional supplier product", kind: "MATERIAL", unit: "unité", supplierId: supplier, purchasePriceCents: 100, salePriceCents: 200, tvaRate: 20, stockTracked: false })
  const supplierData = { name: "Fixture supplier 200", code: "FIX-200", contactName: "Fictional contact", email: "contact@example.test", phone: "", address: "", paymentTerms: "", deliveryDays: "" }
  const current = () => prisma.supplier.findUniqueOrThrow({ where: { id: supplierId } })
  const edit = async (extra: Record<string, unknown> = {}) => updateSupplier({ ...supplierData, supplierId, expectedUpdatedAt: (await current()).updatedAt.toISOString(), ...extra })
  const toggle = async (active: boolean) => setSupplierActive({ supplierId, active, expectedUpdatedAt: (await current()).updatedAt.toISOString() })
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional supplier management" } })).id
    session.userId = (await prisma.user.create({ data: { email: `supplier-management-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    await prisma.supplier.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ companyId: session.companyId, name: `Fixture supplier ${String(index).padStart(3, "0")}`, code: `FIX-${index}`, contactName: index === 200 ? "Old fictional contact" : null })) })
    supplierId = (await prisma.supplier.findFirstOrThrow({ where: { companyId: session.companyId, code: "FIX-200" } })).id
    productId = (await prisma.product.create({ data: { companyId: session.companyId, ...productData(supplierId) } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign supplier management" } })).id
    foreignId = (await prisma.supplier.create({ data: { companyId: foreignCompanyId, name: "Foreign fixture supplier" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.supplier.update({ where: { id: supplierId }, data: { ...supplierData, active: true, deliveryDays: null } })
  })
  afterAll(async () => {
    await prisma.purchaseOrder.deleteMany({ where: { companyId: session.companyId } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("reads all 201 suppliers with a bounded last page and old contact search", async () => {
    const last = await getSupplierDirectory({ page: 999 })
    expect(last).toMatchObject({ total: 201, page: 9 })
    expect(last.items.map(item => item.id)).toEqual([supplierId])
    expect((await getSupplierDirectory({ search: "FIX-200" })).items.map(item => item.id)).toEqual([supplierId])
  })
  it("preserves a selected supplier outside both the page and search", async () => {
    const result = await getSupplierChoices({ search: "no candidate", selectedId: supplierId })
    expect(result.items).toEqual([])
    expect(result.selected?.id).toBe(supplierId)
    expect((await getSupplierChoices({ page: 9 })).items).toHaveLength(1)
  })
  it("does not resolve another company's selected supplier", async () => {
    expect((await getSupplierChoices({ selectedId: foreignId })).selected).toBeNull()
    await expect(edit({ supplierId: foreignId })).rejects.toThrow("introuvable")
  })
  it("saves coordinates and normalizes empty fields without turning an empty delay into zero", async () => {
    await edit({ address: " Fictional address ", paymentTerms: " 30 days ", phone: " 0123 " })
    expect(await current()).toMatchObject({ address: "Fictional address", paymentTerms: "30 days", phone: "0123", deliveryDays: null })
    await edit({ deliveryDays: "0" })
    expect((await current()).deliveryDays).toBe(0)
  })
  it("refuses a stale revision without overwriting the saved coordinates", async () => {
    const revision = (await current()).updatedAt.toISOString()
    await edit({ contactName: "Saved contact" })
    await expect(edit({ expectedUpdatedAt: revision, contactName: "Lost edit" })).rejects.toThrow("a changé")
    expect((await current()).contactName).toBe("Saved contact")
    await expect(setSupplierActive({ supplierId, active: false, expectedUpdatedAt: revision })).rejects.toThrow("a changé")
    expect((await current()).active).toBe(true)
  })
  it.each(["name", "code"])("refuses a duplicate %s atomically", async field => {
    await expect(edit({ [field]: field === "name" ? "Fixture supplier 000" : "FIX-0" })).rejects.toThrow("existe déjà")
    expect((await current()).name).toBe(supplierData.name)
  })
  it.each([-1, 366, 1.5, "invalid"])("refuses invalid delivery delay %s", async deliveryDays => {
    await expect(edit({ deliveryDays })).rejects.toThrow()
    expect((await current()).deliveryDays).toBeNull()
  })
  it("deactivates without deleting references and filters the directory", async () => {
    await toggle(false)
    expect((await getSupplierDirectory({ status: "INACTIVE" })).items.map(item => item.id)).toEqual([supplierId])
    expect((await getSupplierDirectory({ status: "ACTIVE" })).total).toBe(200)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).supplierId).toBe(supplierId)
    expect((await getSupplierChoices({ selectedId: supplierId })).selected).toBeNull()
    expect((await getSupplierChoices({ selectedId: supplierId, productId })).selected?.active).toBe(false)
    await toggle(true)
    expect((await getSupplierChoices({ selectedId: supplierId })).selected?.active).toBe(true)
  })
  it("blocks every new inactive reference but permits editing its already linked product", async () => {
    await toggle(false)
    await expect(createProduct({ sku: "NEW-INACTIVE", label: "Fictional new product", supplierId })).rejects.toThrow("inactif")
    await expect(createCatalogProduct(productData(supplierId))).rejects.toThrow("Fournisseur")
    await expect(createPurchaseOrder({ supplierId, lines: [{ label: "Fictional line", quantity: 1, unitPriceCents: 100 }] })).rejects.toThrow("inactif")
    expect(await prisma.purchaseOrder.count({ where: { companyId: session.companyId } })).toBe(0)
    await updateCatalogProduct(productId, { ...productData(supplierId), sku: "RETAINED", label: "Retained inactive supplier" })
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).supplierId).toBe(supplierId)
  })
  it("does not permit another existing product to acquire an inactive supplier", async () => {
    const unrelated = await createCatalogProduct(productData(null))
    await toggle(false)
    await expect(updateCatalogProduct(unrelated.id, productData(supplierId))).rejects.toThrow("Fournisseur")
    expect((await prisma.product.findUniqueOrThrow({ where: { id: unrelated.id } })).supplierId).toBeNull()
    expect((await getSupplierChoices({ selectedId: supplierId, productId: unrelated.id })).selected).toBeNull()
  })
  it("creates a reference without changing the supplier's coordinates revision", async () => {
    const revision = (await current()).updatedAt
    await createProduct({ sku: `ACTIVE-${randomUUID()}`, label: "Fictional active product", supplierId })
    expect((await current()).updatedAt).toEqual(revision)
  })
  it("rechecks membership revocation with the same session", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getSupplierDirectory()).rejects.toThrow("plus accès")
    await expect(edit()).rejects.toThrow("plus accès")
  })
  it("requires operations write rights for mutations", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    await expect(edit()).rejects.toThrow("droits")
  })
  it("permits reading but blocks all supplier mutations in the public demo", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getSupplierDirectory()).total).toBe(201)
    await expect(createSupplier({ ...supplierData, name: "Demo mutation" })).rejects.toThrow("lecture seule")
    await expect(edit()).rejects.toThrow("lecture seule")
    await expect(toggle(false)).rejects.toThrow("lecture seule")
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { search: "a".repeat(201) }, { status: "OTHER" }])("rejects unbounded directory queries %j", async query => {
    await expect(getSupplierDirectory(query)).rejects.toThrow()
  })
})
