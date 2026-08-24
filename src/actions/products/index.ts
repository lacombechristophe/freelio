"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { hasPermission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const id = z.string().cuid()
const optionalId = z.union([id, z.literal(""), z.null()]).optional().transform((value) => value || null)
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((value) => value || null)

const productSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  label: z.string().trim().min(2).max(200),
  description: optionalText(5_000),
  kind: z.enum(["CONFIGURABLE", "VARIANT", "MATERIAL", "ACCESSORY", "SERVICE_COMPONENT"]),
  manufacturer: optionalText(120),
  family: optionalText(120),
  unit: z.string().trim().min(1).max(30),
  supplierId: optionalId,
  parentProductId: optionalId,
  variantLabel: optionalText(160),
  purchasePriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
  salePriceCents: z.coerce.number().int().min(0).max(2_000_000_000),
  tvaRate: z.coerce.number().min(0).max(100),
  stockTracked: z.boolean(),
})

const optionGroupSchema = z.object({
  productId: id,
  name: z.string().trim().min(2).max(120),
  description: optionalText(1_000),
  required: z.boolean().default(false),
  minSelect: z.coerce.number().int().min(0).max(50),
  maxSelect: z.coerce.number().int().min(1).max(50),
})

const optionValueSchema = z.object({
  groupId: id,
  code: optionalText(60),
  label: z.string().trim().min(1).max(160),
  description: optionalText(1_000),
  priceDeltaCents: z.coerce.number().int().min(-2_000_000_000).max(2_000_000_000),
  costDeltaCents: z.coerce.number().int().min(-2_000_000_000).max(2_000_000_000),
})

const componentSchema = z.object({
  productId: id,
  componentProductId: id,
  quantity: z.coerce.number().positive().max(1_000_000),
  wastePercent: z.coerce.number().min(0).max(100),
  required: z.boolean().default(true),
  notes: optionalText(1_000),
})

function revalidateProduct(productId?: string) {
  revalidatePath("/dashboard/catalogue")
  if (productId) revalidatePath(`/dashboard/catalogue/produits/${productId}`)
}

async function assertSupplierAndParent(companyId: string, supplierId: string | null, parentProductId: string | null, productId?: string) {
  const [supplier, parent] = await Promise.all([
    supplierId ? prisma.supplier.findFirst({ where: { id: supplierId, companyId, active: true }, select: { id: true } }) : null,
    parentProductId ? prisma.product.findFirst({ where: { id: parentProductId, companyId, active: true, parentProductId: null }, select: { id: true } }) : null,
  ])
  if (supplierId && !supplier) throw new Error("Fournisseur introuvable")
  if (parentProductId && (!parent || parentProductId === productId)) throw new Error("Produit parent invalide")
}

async function assertNoComponentCycle(companyId: string, productId: string, componentProductId: string) {
  let frontier = [componentProductId]
  const visited = new Set<string>()
  while (frontier.length) {
    if (frontier.includes(productId)) throw new Error("Cette nomenclature créerait une dépendance circulaire")
    const current = frontier.filter((candidate) => !visited.has(candidate))
    if (!current.length) return
    current.forEach((candidate) => visited.add(candidate))
    if (visited.size > 1_000) throw new Error("Nomenclature trop profonde")
    const nested = await prisma.productComponent.findMany({ where: { companyId, productId: { in: current } }, select: { componentProductId: true } })
    frontier = nested.map((item) => item.componentProductId)
  }
}

function availableQuantity(items: Array<{ quantity: number; reservedQuantity: number }>) {
  return items.reduce((sum, item) => sum + item.quantity - item.reservedQuantity, 0)
}

export async function getProductCatalogue() {
  return withAuth(async ({ companyId, role }) => {
    const [products, suppliers] = await Promise.all([
      prisma.product.findMany({
        where: { companyId },
        include: {
          supplier: { select: { id: true, name: true } },
          parentProduct: { select: { id: true, label: true } },
          inventoryItems: { select: { quantity: true, reservedQuantity: true } },
          _count: { select: { variants: true, optionGroups: true, assemblyComponents: true } },
        },
        orderBy: [{ active: "desc" }, { family: "asc" }, { label: "asc" }],
      }),
      prisma.supplier.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ])
    return {
      canManage: hasPermission(role, "operations.write"),
      suppliers,
      products: products.map((product) => ({
        id: product.id,
        sku: product.sku,
        label: product.label,
        description: product.description,
        kind: product.kind,
        manufacturer: product.manufacturer,
        family: product.family,
        unit: product.unit,
        purchasePriceCents: product.purchasePriceCents,
        salePriceCents: product.salePriceCents,
        tvaRate: product.tvaRate,
        stockTracked: product.stockTracked,
        active: product.active,
        supplierId: product.supplierId,
        supplier: product.supplier,
        parentProductId: product.parentProductId,
        parentProduct: product.parentProduct,
        variantLabel: product.variantLabel,
        availableQuantity: availableQuantity(product.inventoryItems),
        counts: product._count,
      })),
    }
  }, "sales.read")
}

export async function getProductDetail(productId: string) {
  return withAuth(async ({ companyId, role }) => {
    const parsedId = id.parse(productId)
    const [product, references, suppliers] = await Promise.all([
      prisma.product.findFirst({
        where: { id: parsedId, companyId },
        include: {
          supplier: { select: { id: true, name: true } },
          parentProduct: { select: { id: true, label: true, sku: true } },
          variants: { where: { active: true }, include: { supplier: { select: { name: true } } }, orderBy: { label: "asc" } },
          optionGroups: { include: { values: { orderBy: [{ active: "desc" }, { order: "asc" }, { label: "asc" }] } }, orderBy: [{ order: "asc" }, { name: "asc" }] },
          assemblyComponents: { include: { componentProduct: { select: { id: true, sku: true, label: true, unit: true, purchasePriceCents: true } } }, orderBy: { componentProduct: { label: "asc" } } },
          priceHistory: { include: { supplier: { select: { name: true } } }, orderBy: { validFrom: "desc" }, take: 100 },
          inventoryItems: { include: { warehouse: { select: { name: true } } }, orderBy: { warehouse: { name: "asc" } } },
        },
      }),
      prisma.product.findMany({ where: { companyId, active: true }, select: { id: true, sku: true, label: true, parentProductId: true }, orderBy: { label: "asc" } }),
      prisma.supplier.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ])
    if (!product) return null
    return {
      canManage: hasPermission(role, "operations.write"),
      references: references.filter((reference) => reference.id !== product.id),
      suppliers,
      product: {
        ...product,
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
        variants: product.variants.map((variant) => ({ id: variant.id, sku: variant.sku, label: variant.label, variantLabel: variant.variantLabel, purchasePriceCents: variant.purchasePriceCents, salePriceCents: variant.salePriceCents, stockTracked: variant.stockTracked, supplier: variant.supplier })),
        priceHistory: product.priceHistory.map((price) => ({ ...price, validFrom: price.validFrom.toISOString(), validUntil: price.validUntil?.toISOString() ?? null, createdAt: price.createdAt.toISOString() })),
        inventoryItems: product.inventoryItems.map((item) => ({ ...item, updatedAt: item.updatedAt.toISOString() })),
      },
    }
  }, "sales.read")
}

export async function getQuoteProductCatalog() {
  return withAuth(async ({ companyId }) => {
    const products = await prisma.product.findMany({
      where: { companyId, active: true },
      include: {
        optionGroups: { include: { values: { where: { active: true }, orderBy: [{ order: "asc" }, { label: "asc" }] } }, orderBy: [{ order: "asc" }, { name: "asc" }] },
        assemblyComponents: { include: { componentProduct: { select: { purchasePriceCents: true } } } },
        parentProduct: {
          include: {
            optionGroups: { include: { values: { where: { active: true }, orderBy: [{ order: "asc" }, { label: "asc" }] } }, orderBy: [{ order: "asc" }, { name: "asc" }] },
            assemblyComponents: { include: { componentProduct: { select: { purchasePriceCents: true } } } },
          },
        },
      },
      orderBy: [{ family: "asc" }, { label: "asc" }],
    })
    return products.map((product) => {
      const components = product.assemblyComponents.length ? product.assemblyComponents : product.parentProduct?.assemblyComponents ?? []
      const componentCostCents = components.reduce((sum, component) => sum + Math.round(component.quantity * component.componentProduct.purchasePriceCents * (1 + component.wastePercent / 100)), 0)
      const optionGroups = [...(product.parentProduct?.optionGroups ?? []), ...product.optionGroups]
      return {
        id: product.id,
        sku: product.sku,
        label: product.label,
        variantLabel: product.variantLabel,
        family: product.family || product.parentProduct?.family || null,
        unit: product.unit,
        salePriceCents: product.salePriceCents,
        baseCostCents: components.length ? componentCostCents : product.purchasePriceCents,
        tvaRate: product.tvaRate,
        optionGroups: optionGroups.map((group) => ({
          id: group.id,
          name: group.name,
          description: group.description,
          required: group.required,
          minSelect: group.minSelect,
          maxSelect: group.maxSelect,
          values: group.values.map((value) => ({ id: value.id, code: value.code, label: value.label, description: value.description, priceDeltaCents: value.priceDeltaCents, costDeltaCents: value.costDeltaCents })),
        })),
      }
    })
  }, "sales.read")
}

export async function createCatalogProduct(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = productSchema.parse(input)
    await assertSupplierAndParent(companyId, data.supplierId, data.parentProductId)
    if (await prisma.product.findFirst({ where: { companyId, sku: data.sku }, select: { id: true } })) throw new Error("Cette référence existe déjà")
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { companyId, ...data } })
      const now = new Date()
      await tx.productPrice.createMany({ data: [
        { companyId, productId: created.id, supplierId: data.supplierId, kind: "PURCHASE", amountCents: data.purchasePriceCents, validFrom: now },
        { companyId, productId: created.id, kind: "SALE", amountCents: data.salePriceCents, validFrom: now },
      ] })
      return created
    })
    await logAction({ userId, action: "CREATE_CATALOG_PRODUCT", resource: "PRODUCT", resourceId: product.id, payload: { sku: product.sku, parentProductId: product.parentProductId } })
    revalidateProduct(product.id)
    return { success: true as const, id: product.id }
  }, "operations.write")
}

export async function updateCatalogProduct(productId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = id.parse(productId)
    const data = productSchema.parse(input)
    const existing = await prisma.product.findFirst({ where: { id: parsedId, companyId }, select: { id: true, sku: true, supplierId: true, purchasePriceCents: true, salePriceCents: true } })
    if (!existing) throw new Error("Produit introuvable")
    await assertSupplierAndParent(companyId, data.supplierId, data.parentProductId, existing.id)
    if (await prisma.product.findFirst({ where: { companyId, sku: data.sku, id: { not: existing.id } }, select: { id: true } })) throw new Error("Cette référence existe déjà")
    await prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: existing.id }, data })
      const now = new Date()
      for (const price of [
        { kind: "PURCHASE", previous: existing.purchasePriceCents, amount: data.purchasePriceCents, supplierId: data.supplierId },
        { kind: "SALE", previous: existing.salePriceCents, amount: data.salePriceCents, supplierId: null },
      ]) {
        if (price.previous === price.amount && (price.kind !== "PURCHASE" || existing.supplierId === data.supplierId)) continue
        await tx.productPrice.updateMany({ where: { productId: existing.id, kind: price.kind, validUntil: null }, data: { validUntil: now } })
        await tx.productPrice.create({ data: { companyId, productId: existing.id, supplierId: price.supplierId, kind: price.kind, amountCents: price.amount, validFrom: now } })
      }
    })
    await logAction({ userId, action: "UPDATE_CATALOG_PRODUCT", resource: "PRODUCT", resourceId: existing.id, payload: { sku: data.sku, parentProductId: data.parentProductId } })
    revalidateProduct(existing.id)
    return { success: true as const }
  }, "operations.write")
}

export async function setCatalogProductActive(productId: string, active: boolean) {
  return withAuth(async ({ companyId, userId }) => {
    const parsed = z.object({ productId: id, active: z.boolean() }).parse({ productId, active })
    const product = await prisma.product.findFirst({ where: { id: parsed.productId, companyId }, select: { id: true, sku: true } })
    if (!product) throw new Error("Produit introuvable")
    await prisma.product.update({ where: { id: product.id }, data: { active: parsed.active } })
    await logAction({ userId, action: "UPDATE_CATALOG_PRODUCT", resource: "PRODUCT", resourceId: product.id, payload: { active: parsed.active } })
    revalidateProduct(product.id)
    return { success: true as const }
  }, "operations.write")
}

export async function createProductOptionGroup(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = optionGroupSchema.parse(input)
    const minSelect = data.required ? Math.max(1, data.minSelect) : data.minSelect
    if (data.maxSelect < minSelect) throw new Error("Le maximum doit être supérieur ou égal au minimum")
    if (!await prisma.product.findFirst({ where: { id: data.productId, companyId }, select: { id: true } })) throw new Error("Produit introuvable")
    const group = await prisma.productOptionGroup.create({ data: { companyId, ...data, minSelect } })
    await logAction({ userId, action: "UPDATE_PRODUCT_CONFIGURATION", resource: "PRODUCT", resourceId: data.productId, payload: { optionGroupId: group.id } })
    revalidateProduct(data.productId)
    return { success: true as const, id: group.id }
  }, "operations.write")
}

export async function createProductOptionValue(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = optionValueSchema.parse(input)
    const group = await prisma.productOptionGroup.findFirst({ where: { id: data.groupId, companyId }, select: { id: true, productId: true } })
    if (!group) throw new Error("Groupe d’options introuvable")
    const value = await prisma.productOptionValue.create({ data: { companyId, ...data } })
    await logAction({ userId, action: "UPDATE_PRODUCT_CONFIGURATION", resource: "PRODUCT", resourceId: group.productId, payload: { optionValueId: value.id } })
    revalidateProduct(group.productId)
    return { success: true as const, id: value.id }
  }, "operations.write")
}

export async function addProductComponent(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = componentSchema.parse(input)
    if (data.productId === data.componentProductId) throw new Error("Un produit ne peut pas se contenir lui-même")
    const count = await prisma.product.count({ where: { id: { in: [data.productId, data.componentProductId] }, companyId, active: true } })
    if (count !== 2) throw new Error("Produit ou composant introuvable")
    await assertNoComponentCycle(companyId, data.productId, data.componentProductId)
    const component = await prisma.productComponent.upsert({
      where: { productId_componentProductId: { productId: data.productId, componentProductId: data.componentProductId } },
      create: { companyId, ...data },
      update: { quantity: data.quantity, wastePercent: data.wastePercent, required: data.required, notes: data.notes },
    })
    await logAction({ userId, action: "UPDATE_PRODUCT_CONFIGURATION", resource: "PRODUCT", resourceId: data.productId, payload: { componentId: component.id } })
    revalidateProduct(data.productId)
    return { success: true as const, id: component.id }
  }, "operations.write")
}

export async function removeProductConfigurationItem(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("OPTION_GROUP"), id }),
      z.object({ kind: z.literal("OPTION_VALUE"), id }),
      z.object({ kind: z.literal("COMPONENT"), id }),
    ]).parse(input)
    let productId: string | null = null
    if (data.kind === "OPTION_GROUP") {
      const item = await prisma.productOptionGroup.findFirst({ where: { id: data.id, companyId }, select: { productId: true } })
      if (item) { productId = item.productId; await prisma.productOptionGroup.delete({ where: { id: data.id } }) }
    } else if (data.kind === "OPTION_VALUE") {
      const item = await prisma.productOptionValue.findFirst({ where: { id: data.id, companyId }, select: { group: { select: { productId: true } } } })
      if (item) { productId = item.group.productId; await prisma.productOptionValue.delete({ where: { id: data.id } }) }
    } else {
      const item = await prisma.productComponent.findFirst({ where: { id: data.id, companyId }, select: { productId: true } })
      if (item) { productId = item.productId; await prisma.productComponent.delete({ where: { id: data.id } }) }
    }
    if (!productId) throw new Error("Élément de configuration introuvable")
    await logAction({ userId, action: "UPDATE_PRODUCT_CONFIGURATION", resource: "PRODUCT", resourceId: productId, payload: { removedKind: data.kind } })
    revalidateProduct(productId)
    return { success: true as const }
  }, "operations.write")
}
