import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createCatalogProduct, getProductCatalogue, getProductParentChoices } from "@/actions/products"

describe.sequential("complete paginated product catalogue on real SQL", () => {
  let membershipId: string, agencyId: string, rootId: string, foreignRootId: string, foreignCompanyId: string, variantId: string, inactiveId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional catalogue volume" } })).id
    session.userId = (await prisma.user.create({ data: { email: `catalogue-volume-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    await prisma.product.createMany({ data: Array.from({ length: 601 }, (_, index) => ({ companyId: session.companyId, sku: `VOLUME-${String(index).padStart(3, "0")}`, label: `Fictional catalogue ${String(index).padStart(3, "0")}` })) })
    rootId = (await prisma.product.findFirstOrThrow({ where: { companyId: session.companyId, sku: "VOLUME-600" } })).id
    await prisma.product.update({ where: { id: rootId }, data: { manufacturer: "Fictional distinctive maker" } })
    variantId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "VARIANT", label: "ZZZ Fictional variant", parentProductId: rootId, kind: "VARIANT", variantLabel: "Fictional distant variant", family: "ZZZ distinctive family" } })).id
    inactiveId = (await prisma.product.create({ data: { companyId: session.companyId, sku: "INACTIVE", label: "ZZZ Fictional inactive", active: false } })).id
    await prisma.productOptionGroup.create({ data: { companyId: session.companyId, productId: rootId, name: "Fictional option" } })
    for (const [code, quantity] of [["LOCAL", 5], ["OTHER", 99]] as const) {
      const agency = await prisma.agency.create({ data: { companyId: session.companyId, code, name: `Fictional ${code} agency` } })
      if (code === "LOCAL") { agencyId = agency.id; await prisma.agencyMembership.create({ data: { agencyId, membershipId } }) }
      const warehouse = await prisma.warehouse.create({ data: { companyId: session.companyId, agencyId: agency.id, code, name: `Fictional ${code} warehouse` } })
      await prisma.inventoryItem.create({ data: { companyId: session.companyId, warehouseId: warehouse.id, productId: rootId, quantity, reservedQuantity: 1 } })
    }
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign catalogue" } })).id
    foreignRootId = (await prisma.product.create({ data: { companyId: foreignCompanyId, sku: "FOREIGN", label: "Foreign catalogue product" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
  })
  afterAll(async () => {
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("bounds the first page while preserving whole-catalogue counters", async () => {
    const data = await getProductCatalogue()
    expect(data.products).toHaveLength(25)
    expect(data.total).toBe(603)
    expect(data.metrics).toEqual({ active: 602, variants: 1, optionGroups: 1 })
  })
  it("reaches every row once with stable ties and clamps the last page", async () => {
    const ids = new Set<string>()
    for (let page = 1; page <= 25; page++) {
      const data = await getProductCatalogue({ page })
      expect(data.page).toBe(page)
      expect(data.products.length).toBeLessThanOrEqual(25)
      for (const row of data.products) { expect(ids.has(row.id)).toBe(false); ids.add(row.id) }
    }
    expect(ids.size).toBe(603)
    const last = await getProductCatalogue({ page: 1_000_000 })
    expect(last.page).toBe(25)
    expect(last.products.some(row => row.id === inactiveId)).toBe(true)
  })
  it.each(["volume-600", "catalogue 600", "distinctive maker", "distant variant", "distinctive family"])("searches %s beyond the first page without changing counters", async search => {
    const data = await getProductCatalogue({ search, page: 99 })
    expect(data.total).toBe(1)
    expect(data.page).toBe(1)
    expect(data.products[0].id).toBe(search.includes("variant") || search.includes("family") ? variantId : rootId)
    expect(data.metrics).toEqual({ active: 602, variants: 1, optionGroups: 1 })
  })
  it("keeps a selected root outside the parent search and page", async () => {
    const data = await getProductParentChoices({ selectedId: rootId, search: "catalogue 000" })
    expect(data.total).toBe(1)
    expect(data.items[0].id).not.toBe(rootId)
    expect(data.selected?.id).toBe(rootId)
    expect((await getProductParentChoices({ page: 99 })).page).toBe(25)
    expect((await getProductParentChoices({ search: "VOLUME-600" })).items[0].id).toBe(rootId)
  })
  it("excludes self, variants, inactive and foreign parents", async () => {
    expect((await getProductParentChoices({ productId: rootId, selectedId: rootId })).selected).toBeNull()
    for (const selectedId of [variantId, inactiveId, foreignRootId]) expect((await getProductParentChoices({ selectedId })).selected).toBeNull()
    expect((await getProductParentChoices()).total).toBe(601)
    expect((await getProductCatalogue({ search: "Foreign catalogue" })).total).toBe(0)
  })
  it("keeps stock scoped to active assigned agencies on every searched page", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect((await getProductCatalogue({ search: "VOLUME-600" })).products[0].availableQuantity).toBe(4)
    await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    expect((await getProductCatalogue({ search: "VOLUME-600" })).products[0].availableQuantity).toBe(0)
  })
  it("refuses both readers after membership revocation", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getProductCatalogue()).rejects.toThrow("plus accès")
    await expect(getProductParentChoices()).rejects.toThrow("plus accès")
  })
  it("preserves sales-read permissions without granting access to Technician", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await expect(getProductCatalogue()).rejects.toThrow("droits nécessaires")
    await expect(getProductParentChoices()).rejects.toThrow("droits nécessaires")
  })
  it("keeps public-demo reads and refuses product writes", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getProductCatalogue({ search: "VOLUME-600" })).total).toBe(1)
    expect((await getProductParentChoices({ selectedId: rootId })).selected?.id).toBe(rootId)
    await expect(createCatalogProduct({})).rejects.toThrow(/lecture seule|démonstration/i)
  })
  it.each([{ page: 0 }, { page: 1.5 }, { page: 1_000_001 }, { search: "x".repeat(201) }])("rejects unbounded input %j", async input => {
    await expect(getProductCatalogue(input)).rejects.toThrow()
    await expect(getProductParentChoices(input)).rejects.toThrow()
  })
})
