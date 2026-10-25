import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import prisma from "@/lib/prisma"
import { getDeliveryLineChoices, getDeliveryOrderChoices } from "@/actions/delivery-choices"

describe.sequential("Delivery order and line choices on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string
  let oldestOrderId: string, oldestLineId: string, otherOrderId: string, otherLineId: string, projectId: string

  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional delivery choices" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional delivery choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `delivery-choices-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Local choice agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other choice agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    for (const [companyId, scopeAgency, amount, prefix] of [[session.companyId, agencyId, 151, "CHOICE"], [session.companyId, otherAgencyId, 1, "OTHER"], [foreignCompanyId, null, 1, "FOREIGN"]] as const) {
      const client = await prisma.client.create({ data: { companyId, name: `${prefix} client` } })
      const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: scopeAgency, name: `${prefix} project` } })
      await prisma.customerOrder.createMany({ data: Array.from({ length: amount }, (_, index) => ({ companyId, clientId: client.id, projectId: project.id, number: `${prefix}-${String(index).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)), status: "CONFIRMED" })) })
      const orders = await prisma.customerOrder.findMany({ where: { companyId, projectId: project.id }, select: { id: true, number: true } })
      await prisma.customerOrderLine.createMany({ data: orders.map(order => ({ customerOrderId: order.id, label: `${prefix} material`, quantity: 3, deliveredQuantity: 1, unitPriceCents: 100 })) })
      if (scopeAgency === agencyId) {
        oldestOrderId = orders.find(order => order.number === "CHOICE-000")!.id
        projectId = project.id
        otherOrderId = orders.find(order => order.number === "CHOICE-001")!.id
        otherLineId = (await prisma.customerOrderLine.findFirstOrThrow({ where: { customerOrderId: otherOrderId } })).id
        await prisma.customerOrderLine.createMany({ data: Array.from({ length: 150 }, (_, index) => ({ customerOrderId: oldestOrderId, label: `Material ${String(index).padStart(3, "0")}`, quantity: 0.3, deliveredQuantity: 0.1, unitPriceCents: 100, order: index + 1 })) })
        oldestLineId = (await prisma.customerOrderLine.findFirstOrThrow({ where: { customerOrderId: oldestOrderId, order: 150 } })).id
      }
    }
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })
  afterAll(async () => {
    for (const companyId of [session.companyId, foreignCompanyId]) {
      await prisma.customerOrder.deleteMany({ where: { companyId } })
      await prisma.project.deleteMany({ where: { companyId } })
      await prisma.customerSite.deleteMany({ where: { companyId } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("pages through all 152 authorized orders without overlap", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await getDeliveryOrderChoices({ page })
      expect(result).toMatchObject({ total: 152, page })
      expect(result.items).toHaveLength(page === 7 ? 2 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(152)
    expect(ids).toContain(oldestOrderId)
  })
  it("keeps an old order selected outside both the page and search", async () => {
    const result = await getDeliveryOrderChoices({ search: "missing query", page: 99, selectedId: oldestOrderId })
    expect(result).toMatchObject({ items: [], page: 1, total: 0, selected: { id: oldestOrderId, label: "CHOICE-000 · CHOICE client", remainingQuantity: null } })
  })
  for (const search of ["  choice-000  ", "CHOICE client", "CHOICE project"]) {
    it(`searches orders by ${search.trim()} before pagination`, async () => {
      const result = await getDeliveryOrderChoices({ search, page: 99 })
      expect(result.total).toBe(search.trim().toLowerCase() === "choice-000" ? 1 : 151)
      expect(result.page).toBe(result.total === 1 ? 1 : 7)
    })
  }
  it("pages through all 151 remaining lines of the selected order", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await getDeliveryLineChoices({ customerOrderId: oldestOrderId, page })
      expect(result).toMatchObject({ total: 151, page })
      expect(result.items).toHaveLength(page === 7 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(151)
    expect(ids).toContain(oldestLineId)
    expect(ids).not.toContain(otherLineId)
  })
  it("keeps an off-page line selected without changing the decimal remainder", async () => {
    expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, search: "missing query", selectedId: oldestLineId, page: 999 })).toMatchObject({
      items: [], total: 0, page: 1, selected: { id: oldestLineId, remainingQuantity: 0.2, label: "Material 149 · reste 0,2" },
    })
  })
  it("finds the last line before applying pagination", async () => {
    expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, search: "  material 149  ", page: 99 })).toMatchObject({ total: 1, page: 1, items: [{ id: oldestLineId }] })
  })
  it("keeps quantities smaller than one hundredth available", async () => {
    await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.0003, deliveredQuantity: 0.0001 } })
    try { expect((await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).selected).toMatchObject({ remainingQuantity: 0.0002 }) }
    finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.3, deliveredQuantity: 0.1 } }) }
  })
  it("retains the largest finite historical quantity without overflowing a SQL filter", async () => {
    // A literal preserves the historical database value independently of the
    // client parameter conversion being qualified.
    await prisma.$executeRaw`UPDATE "CustomerOrderLine" SET "quantity" = 1.7976931348623157e308, "deliveredQuantity" = 0 WHERE "id" = ${oldestLineId}`
    try {
      expect(await getDeliveryOrderChoices({ selectedId: oldestOrderId })).toMatchObject({ selected: { id: oldestOrderId } })
      expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).toMatchObject({ selected: { id: oldestLineId, remainingQuantity: Number.MAX_VALUE } })
    } finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.3, deliveredQuantity: 0.1 } }) }
  })
  it.skipIf(!process.env.DATABASE_URL?.startsWith("postgres"))("excludes PostgreSQL's non-finite historical quantities", async () => {
    for (const value of ["Infinity", "-Infinity", "NaN"]) {
      await prisma.$executeRaw`UPDATE "CustomerOrderLine" SET "quantity" = CAST(${value} AS DOUBLE PRECISION), "deliveredQuantity" = 0 WHERE "id" = ${oldestLineId}`
      try { expect((await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).selected).toBeNull() }
      finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.3, deliveredQuantity: 0.1 } }) }
      await prisma.$executeRaw`UPDATE "CustomerOrderLine" SET "deliveredQuantity" = CAST(${value} AS DOUBLE PRECISION) WHERE "id" = ${oldestLineId}`
      try { expect((await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).selected).toBeNull() }
      finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.3, deliveredQuantity: 0.1 } }) }
    }
  })
  for (const quantities of [{ quantity: 0, deliveredQuantity: 0 }, { quantity: -1, deliveredQuantity: 0 }, { quantity: 0.3, deliveredQuantity: -0.1 }, { quantity: 0.3, deliveredQuantity: 0.4 }]) {
    it(`does not offer invalid remaining quantities ${JSON.stringify(quantities)}`, async () => {
      await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: quantities })
      try { expect((await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).selected).toBeNull() }
      finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { quantity: 0.3, deliveredQuantity: 0.1 } }) }
    })
  }
  it("cannot carry a selected line into another order", async () => {
    const result = await getDeliveryLineChoices({ customerOrderId: otherOrderId, selectedId: oldestLineId })
    expect(result).toMatchObject({ total: 1, selected: null, items: [{ id: otherLineId }] })
  })
  for (const status of ["CANCELED", "CANCELLED", "DRAFT", "DELIVERED"]) {
    it(`removes an order and its selected line after status ${status}`, async () => {
      await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status } })
      try {
        expect(await getDeliveryOrderChoices({ search: "CHOICE-000", selectedId: oldestOrderId })).toMatchObject({ total: 0, selected: null, items: [] })
        expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).toMatchObject({ total: 0, selected: null, items: [] })
      } finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status: "CONFIRMED" } }) }
    })
  }
  it("does not offer an order whose last line was delivered", async () => {
    await prisma.customerOrderLine.update({ where: { id: otherLineId }, data: { deliveredQuantity: 3 } })
    try {
      expect(await getDeliveryOrderChoices({ search: "CHOICE-001", selectedId: otherOrderId })).toMatchObject({ total: 0, selected: null })
      expect(await getDeliveryLineChoices({ customerOrderId: otherOrderId, selectedId: otherLineId })).toMatchObject({ total: 0, selected: null })
    } finally { await prisma.customerOrderLine.update({ where: { id: otherLineId }, data: { deliveredQuantity: 1 } }) }
  })
  it("removes a selected line when its remaining quantity reaches zero", async () => {
    await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { deliveredQuantity: 0.3 } })
    try { expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId, search: "Material 149" })).toMatchObject({ total: 0, selected: null }) }
    finally { await prisma.customerOrderLine.update({ where: { id: oldestLineId }, data: { deliveredQuantity: 0.1 } }) }
  })
  it("does not verify a selected order whose project belongs to a different client", async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Other local client" } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId: client.id } })
    try {
      expect((await getDeliveryOrderChoices({ selectedId: oldestOrderId })).selected).toBeNull()
      expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId })).toMatchObject({ total: 0, selected: null })
    } finally {
      await prisma.project.update({ where: { id: projectId }, data: { clientId: before.clientId } })
      await prisma.client.delete({ where: { id: client.id } })
    }
  })
  it("excludes a project client belonging to another company", async () => {
    const before = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })
    const foreign = await prisma.client.findFirstOrThrow({ where: { companyId: foreignCompanyId } })
    await prisma.project.update({ where: { id: projectId }, data: { clientId: foreign.id } })
    try {
      expect(await getDeliveryOrderChoices({ selectedId: oldestOrderId })).toMatchObject({ total: 1, selected: null })
      expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId })).toMatchObject({ total: 0, selected: null })
    } finally { await prisma.project.update({ where: { id: projectId }, data: { clientId: before.clientId } }) }
  })
  it("does not verify a selected order with another client's site", async () => {
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Other site client" } })
    const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, label: "Other client's site", address1: "1 Fictional street" } })
    await prisma.project.update({ where: { id: projectId }, data: { siteId: site.id } })
    try {
      expect((await getDeliveryOrderChoices({ selectedId: oldestOrderId })).selected).toBeNull()
      expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId })).toMatchObject({ total: 0 })
    } finally {
      await prisma.project.update({ where: { id: projectId }, data: { siteId: null } })
      await prisma.customerSite.delete({ where: { id: site.id } })
      await prisma.client.delete({ where: { id: client.id } })
    }
  })
  it("keeps agency-restricted users inside their assignments", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect((await getDeliveryOrderChoices()).total).toBe(151)
    expect((await getDeliveryOrderChoices({ search: "OTHER" })).total).toBe(0)
    const other = await prisma.customerOrder.findFirstOrThrow({ where: { companyId: session.companyId, number: "OTHER-000" } })
    expect(await getDeliveryLineChoices({ customerOrderId: other.id })).toMatchObject({ items: [], total: 0 })
  })
  it("reevaluates revoked access for both selected references", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getDeliveryOrderChoices({ selectedId: oldestOrderId })).toMatchObject({ total: 0, selected: null })
      expect(await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })).toMatchObject({ total: 0, selected: null })
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("supports Viewer and public-demo reads without creating records", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getDeliveryOrderChoices()).total).toBe(151)
    expect((await getDeliveryLineChoices({ customerOrderId: oldestOrderId })).total).toBe(151)
    expect(await prisma.deliveryNote.count({ where: { companyId: session.companyId } })).toBe(0)
  })
  it("returns no other-company selection or lines", async () => {
    const foreign = await prisma.customerOrder.findFirstOrThrow({ where: { companyId: foreignCompanyId } })
    expect((await getDeliveryOrderChoices({ selectedId: foreign.id, search: "FOREIGN" })).selected).toBeNull()
    expect(await getDeliveryLineChoices({ customerOrderId: foreign.id, selectedId: otherLineId })).toMatchObject({ items: [], total: 0, selected: null })
  })
  it("returns no financial fields in either option payload", async () => {
    const orders = await getDeliveryOrderChoices({ selectedId: oldestOrderId }), lines = await getDeliveryLineChoices({ customerOrderId: oldestOrderId, selectedId: oldestLineId })
    for (const row of [...orders.items, orders.selected!, ...lines.items, lines.selected!]) expect(Object.keys(row).sort()).toEqual(["id", "label", "remainingQuantity"])
  })
  it("validates page, query, selection and required order", async () => {
    for (const input of [{ page: 0 }, { search: "x".repeat(201) }, { selectedId: "bad" }, { extra: true }]) await expect(getDeliveryOrderChoices(input)).rejects.toThrow()
    await expect(getDeliveryLineChoices({})).rejects.toThrow()
    await expect(getDeliveryLineChoices({ customerOrderId: oldestOrderId, extra: true })).rejects.toThrow()
  })
})
