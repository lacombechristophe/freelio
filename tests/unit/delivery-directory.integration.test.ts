import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

import prisma from "@/lib/prisma"
import { getDeliveryNoteDirectory } from "@/actions/operations-orders"

describe.sequential("Delivery directory on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string
  let oldestId: string, foreignOrderId: string, foreignLineId: string

  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional delivery directory" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictional deliveries" } })).id
    session.userId = (await prisma.user.create({ data: { email: `delivery-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Local deliveries" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other deliveries" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    for (const [companyId, scopeAgency, amount, prefix] of [[session.companyId, agencyId, 101, "DELIVERY"], [session.companyId, otherAgencyId, 1, "OTHER"], [foreignCompanyId, null, 1, "FOREIGN"]] as const) {
      const client = await prisma.client.create({ data: { companyId, name: `${prefix} client` } })
      const project = await prisma.project.create({ data: { companyId, clientId: client.id, agencyId: scopeAgency, name: `${prefix} project` } })
      const order = await prisma.customerOrder.create({ data: { companyId, clientId: client.id, projectId: project.id, number: `${prefix}-ORDER`, status: "DELIVERED" } })
      const line = await prisma.customerOrderLine.create({ data: { customerOrderId: order.id, label: `${prefix} material`, quantity: amount, deliveredQuantity: amount, unitPriceCents: 100 } })
      await prisma.deliveryNote.createMany({ data: Array.from({ length: amount }, (_, index) => ({ companyId, customerOrderId: order.id, projectId: project.id, number: `${prefix}-${String(index).padStart(3, "0")}`, status: index % 2 ? "SIGNED" : "DELIVERED", signedAt: index % 2 ? new Date("2020-01-01") : null, signatureSha256: index % 2 ? "historical-hash" : null, signedDocument: index === 1 ? "must-not-be-serialized" : null, sealVersion: index === 1 ? 1 : null, recipientName: index === 0 ? "Oldest recipient" : null, createdAt: new Date(Date.UTC(2020, 0, 1, 0, index)) })) })
      const notes = await prisma.deliveryNote.findMany({ where: { companyId, customerOrderId: order.id }, select: { id: true, number: true } })
      await prisma.deliveryNoteLine.createMany({ data: notes.map(note => ({ deliveryNoteId: note.id, customerOrderLineId: line.id, label: `${prefix} material`, quantity: 1 })) })
      if (scopeAgency === agencyId) oldestId = notes.find(note => note.number === "DELIVERY-000")!.id
      if (companyId === foreignCompanyId) { foreignOrderId = order.id; foreignLineId = line.id }
    }
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
  })

  afterAll(async () => {
    for (const companyId of [session.companyId, foreignCompanyId]) {
      await prisma.deliveryNoteLine.deleteMany({ where: { deliveryNote: { companyId } } })
      await prisma.deliveryNote.deleteMany({ where: { companyId } })
      await prisma.customerOrderLine.deleteMany({ where: { customerOrder: { companyId } } })
      await prisma.customerOrder.deleteMany({ where: { companyId } })
      await prisma.project.deleteMany({ where: { companyId } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.delete({ where: { id: session.userId } })
  })

  it("pages through all 101 agency notes without overlaps", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 5; page++) {
      const result = await getDeliveryNoteDirectory({ agencyId, page })
      expect(result).toMatchObject({ total: 101, page })
      expect(result.items).toHaveLength(page === 5 ? 1 : 25)
      ids.push(...result.items.map(note => note.id))
    }
    expect(new Set(ids).size).toBe(101)
    expect(ids).toContain(oldestId)
  })
  for (const search of ["  delivery-000  ", "Oldest recipient"]) {
    it(`finds the oldest note by ${search.trim()} before pagination`, async () => {
      const result = await getDeliveryNoteDirectory({ agencyId, search, page: 999 })
      expect(result).toMatchObject({ total: 1, page: 1 })
      expect(result.items.map(note => note.id)).toEqual([oldestId])
    })
  }
  for (const search of ["DELIVERY client", "DELIVERY project", "DELIVERY material", "DELIVERY-ORDER"]) {
    it(`searches the complete authorized relation ${search}`, async () => {
      expect(await getDeliveryNoteDirectory({ search, page: 5 })).toMatchObject({ total: 101, page: 5 })
    })
  }
  it("separates company and selected agency", async () => {
    expect((await getDeliveryNoteDirectory()).total).toBe(102)
    expect((await getDeliveryNoteDirectory({ agencyId: otherAgencyId })).total).toBe(1)
  })
  it("combines state with search before counting and clamps pages", async () => {
    expect(await getDeliveryNoteDirectory({ agencyId, state: "UNSIGNED", page: 99 })).toMatchObject({ total: 51, page: 3 })
    expect(await getDeliveryNoteDirectory({ agencyId, state: "SIGNED", page: 99 })).toMatchObject({ total: 50, page: 2 })
    expect(await getDeliveryNoteDirectory({ agencyId, state: "SIGNED", search: "DELIVERY-000" })).toMatchObject({ total: 0, page: 1, items: [] })
    expect(await getDeliveryNoteDirectory({ agencyId, state: "UNSIGNED", search: "DELIVERY-000" })).toMatchObject({ total: 1, items: [{ id: oldestId }] })
  })
  it("treats a historical signed timestamp as signed despite its old status", async () => {
    await prisma.deliveryNote.update({ where: { id: oldestId }, data: { signedAt: new Date("2020-01-01") } })
    try {
      expect(await getDeliveryNoteDirectory({ state: "SIGNED", search: "DELIVERY-000" })).toMatchObject({ total: 1, items: [{ sealVersion: null }] })
      expect((await getDeliveryNoteDirectory({ state: "UNSIGNED", search: "DELIVERY-000" })).total).toBe(0)
    } finally { await prisma.deliveryNote.update({ where: { id: oldestId }, data: { signedAt: null } }) }
  })
  it("never serializes the capture, fingerprint or financial order fields", async () => {
    const result = await getDeliveryNoteDirectory({ search: "DELIVERY-001" })
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    for (const key of ["signedDocument", "signatureSha256", "notes"]) expect(item).not.toHaveProperty(key)
    for (const key of ["billingStatus", "totalTtcCents", "depositCents", "invoices"]) expect(item.customerOrder).not.toHaveProperty(key)
    expect(JSON.stringify(result)).not.toContain("must-not-be-serialized")
  })
  it("excludes a locally keyed note whose order belongs to another company", async () => {
    const note = await prisma.deliveryNote.create({ data: { companyId: session.companyId, customerOrderId: foreignOrderId, number: "INVALID-ORDER" } })
    try { expect((await getDeliveryNoteDirectory()).total).toBe(102) }
    finally { await prisma.deliveryNote.delete({ where: { id: note.id } }) }
  })
  it("excludes a note whose source line belongs to another company", async () => {
    const line = await prisma.deliveryNoteLine.findFirstOrThrow({ where: { deliveryNoteId: oldestId } })
    await prisma.deliveryNoteLine.update({ where: { id: line.id }, data: { customerOrderLineId: foreignLineId } })
    try { expect(await getDeliveryNoteDirectory({ search: "DELIVERY-000" })).toMatchObject({ total: 0, items: [] }) }
    finally { await prisma.deliveryNoteLine.update({ where: { id: line.id }, data: { customerOrderLineId: line.customerOrderLineId } }) }
  })
  it("does not allow search to widen a restricted agency", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect((await getDeliveryNoteDirectory()).total).toBe(101)
    expect((await getDeliveryNoteDirectory({ search: "OTHER" })).total).toBe(0)
    await expect(getDeliveryNoteDirectory({ agencyId: otherAgencyId })).rejects.toThrow("AGENCY_ACCESS_DENIED")
  })
  it("reevaluates a revoked agency assignment", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try { expect(await getDeliveryNoteDirectory()).toMatchObject({ total: 0, items: [] }) }
    finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("rejects an inactive agency selection", async () => {
    await prisma.agency.update({ where: { id: otherAgencyId }, data: { active: false } })
    try { await expect(getDeliveryNoteDirectory({ agencyId: otherAgencyId })).rejects.toThrow("inactive") }
    finally { await prisma.agency.update({ where: { id: otherAgencyId }, data: { active: true } }) }
  })
  it("allows Viewer reads without signature commands", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect(await getDeliveryNoteDirectory()).toMatchObject({ total: 101, canManageDeliveries: false })
  })
  it("offers signature commands to Operations within the current scope", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    expect(await getDeliveryNoteDirectory()).toMatchObject({ total: 101, canManageDeliveries: true })
  })
  it("keeps the public demo readable without signature commands", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect(await getDeliveryNoteDirectory()).toMatchObject({ total: 102, canManageDeliveries: false })
  })
  it("returns a stable first page for an empty search result", async () => {
    expect(await getDeliveryNoteDirectory({ search: "missing note", page: 999 })).toMatchObject({ total: 0, page: 1, items: [] })
  })
  it("uses a deterministic tie breaker for equal creation times", async () => {
    const before = await prisma.deliveryNote.findMany({ where: { companyId: session.companyId }, select: { id: true, createdAt: true } })
    await prisma.deliveryNote.updateMany({ where: { companyId: session.companyId }, data: { createdAt: new Date("2020-01-01") } })
    try {
      const a = await getDeliveryNoteDirectory({ page: 1 }), b = await getDeliveryNoteDirectory({ page: 2 })
      expect([...a.items, ...b.items].map(note => note.id)).toEqual(before.map(note => note.id).sort().slice(0, 50))
    } finally { for (const note of before) await prisma.deliveryNote.update({ where: { id: note.id }, data: { createdAt: note.createdAt } }) }
  })
  it("validates bounds, state and unexpected input", async () => {
    for (const input of [{ page: 0 }, { page: 1.2 }, { search: "x".repeat(201) }, { state: "CANCELED" }, { extra: true }]) {
      await expect(getDeliveryNoteDirectory(input)).rejects.toThrow()
    }
  })
})
