import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", authenticated: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => session.authenticated ? { user: { id: session.userId }, companyId: session.companyId } : null }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getReservationOrderChoices, getReservationProjectChoices } from "@/actions/reservation-choices"

describe.sequential("Complete reservation references on real SQL", () => {
  let membershipId: string, agencyId: string, otherAgencyId: string, foreignCompanyId: string, clientId: string, otherClientId: string, foreignClientId: string
  let oldestOrderId: string, projectId: string, lastProjectId: string, foreignProjectId: string, foreignOrderId: string, otherOrderId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictitious reservation choices" } })).id
    session.userId = (await prisma.user.create({ data: { email: `reservation-choice-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictitious choice client" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Other fictitious client" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "CHOICE", name: "Fictitious choice agency" } })).id
    otherAgencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Other fictitious agency" } })).id
    await prisma.agencyMembership.create({ data: { membershipId, agencyId } })
    await prisma.project.createMany({ data: Array.from({ length: 301 }, (_, index) => ({ companyId: session.companyId, clientId, agencyId: index === 300 ? otherAgencyId : agencyId, name: `Project ${String(index).padStart(3, "0")}` })) })
    projectId = (await prisma.project.findFirstOrThrow({ where: { companyId: session.companyId, name: "Project 000" } })).id
    lastProjectId = (await prisma.project.findFirstOrThrow({ where: { companyId: session.companyId, name: "Project 300" } })).id
    await prisma.customerOrder.createMany({ data: Array.from({ length: 151 }, (_, index) => ({ companyId: session.companyId, clientId, projectId: index === 150 ? lastProjectId : projectId, number: `ORDER-${String(index).padStart(3, "0")}`, status: "CONFIRMED", createdAt: new Date(Date.UTC(2000, 0, 1, 0, index)) })) })
    oldestOrderId = (await prisma.customerOrder.findFirstOrThrow({ where: { companyId: session.companyId, number: "ORDER-000" } })).id
    otherOrderId = (await prisma.customerOrder.findFirstOrThrow({ where: { companyId: session.companyId, number: "ORDER-150" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Foreign fictitious choices" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "FOREIGN CLIENT" } })).id
    foreignProjectId = (await prisma.project.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, name: "FOREIGN PROJECT" } })).id
    foreignOrderId = (await prisma.customerOrder.create({ data: { companyId: foreignCompanyId, clientId: foreignClientId, projectId: foreignProjectId, number: "FOREIGN ORDER", status: "CONFIRMED" } })).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); session.authenticated = true
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    if (!session.companyId) return
    for (const companyId of [session.companyId, foreignCompanyId]) {
      await prisma.customerOrder.deleteMany({ where: { companyId } })
      await prisma.quote.deleteMany({ where: { companyId } })
      await prisma.project.deleteMany({ where: { companyId } })
      await prisma.customerSite.deleteMany({ where: { companyId } })
      await prisma.client.deleteMany({ where: { companyId } })
      await prisma.company.delete({ where: { id: companyId } })
    }
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("makes all 151 authorized orders available to the reservation composer", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 7; page++) {
      const result = await getReservationOrderChoices({ page })
      expect(result).toMatchObject({ total: 151, page }); expect(result.items).toHaveLength(page === 7 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(151); expect(ids).toContain(oldestOrderId)
  })
  it("makes all 301 active projects available to the reservation composer", async () => {
    const ids: string[] = []
    for (let page = 1; page <= 13; page++) {
      const result = await getReservationProjectChoices({ page })
      expect(result).toMatchObject({ total: 301, page }); expect(result.items).toHaveLength(page === 13 ? 1 : 25)
      ids.push(...result.items.map(item => item.id))
    }
    expect(new Set(ids).size).toBe(301); expect(ids).toContain(lastProjectId)
  })
  it("retains both selected references outside their search and page", async () => {
    expect(await getReservationOrderChoices({ search: "absent", page: 999, selectedId: oldestOrderId })).toMatchObject({ items: [], total: 0, page: 1, selected: { id: oldestOrderId, label: "ORDER-000 · Fictitious choice client" } })
    expect(await getReservationProjectChoices({ search: "absent", page: 999, selectedId: lastProjectId })).toMatchObject({ items: [], total: 0, page: 1, selected: { id: lastProjectId, label: "Project 300" } })
  })
  for (const [search, total] of [["  order-000  ", 1], ["Fictitious choice client", 151], ["Project 000", 150]] as const) {
    it(`searches orders by ${search.trim()} before pagination`, async () => {
      expect(await getReservationOrderChoices({ search, page: 999 })).toMatchObject({ total, page: Math.ceil(total / 25) })
    })
  }
  it("finds a project past the old cap and clamps an excessive page", async () => {
    expect(await getReservationProjectChoices({ search: "  project 300  ", page: 999 })).toMatchObject({ total: 1, page: 1, items: [{ id: lastProjectId }] })
  })
  it("keeps tied project names in a stable id order", async () => {
    await prisma.project.update({ where: { id: lastProjectId }, data: { name: "Project 000" } })
    try { expect((await getReservationProjectChoices({ search: "Project 000" })).items.map(item => item.id)).toEqual([projectId, lastProjectId].sort()) }
    finally { await prisma.project.update({ where: { id: lastProjectId }, data: { name: "Project 300" } }) }
  })
  for (const status of ["DELIVERED", "COMPLETED", "CANCELLED"]) {
    it(`invalidates an order now ${status} under the existing composer policy`, async () => {
      await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status } })
      try { expect(await getReservationOrderChoices({ selectedId: oldestOrderId })).toMatchObject({ total: 150, selected: null }) }
      finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status: "CONFIRMED" } }) }
    })
  }
  it("retains the existing draft-order choice policy", async () => {
    await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status: "DRAFT" } })
    try { expect((await getReservationOrderChoices({ selectedId: oldestOrderId })).selected?.id).toBe(oldestOrderId) }
    finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { status: "CONFIRMED" } }) }
  })
  it("invalidates an inactive project without replacing the selection", async () => {
    await prisma.project.update({ where: { id: lastProjectId }, data: { status: "COMPLETED" } })
    try { expect(await getReservationProjectChoices({ selectedId: lastProjectId })).toMatchObject({ total: 300, selected: null }) }
    finally { await prisma.project.update({ where: { id: lastProjectId }, data: { status: "ACTIVE" } }) }
  })
  it("limits both lists and selected references to assigned agencies", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await getReservationOrderChoices({ selectedId: otherOrderId })).toMatchObject({ total: 150, selected: null })
    expect(await getReservationProjectChoices({ selectedId: lastProjectId })).toMatchObject({ total: 300, selected: null })
  })
  it("revokes both selections when the agency assignment is removed", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    await prisma.agencyMembership.deleteMany({ where: { membershipId, agencyId } })
    try {
      expect(await getReservationOrderChoices({ selectedId: oldestOrderId })).toMatchObject({ total: 0, selected: null, items: [] })
      expect(await getReservationProjectChoices({ selectedId: projectId })).toMatchObject({ total: 0, selected: null, items: [] })
    } finally { await prisma.agencyMembership.create({ data: { membershipId, agencyId } }) }
  })
  it("does not expose foreign-company selections or search results", async () => {
    expect(await getReservationOrderChoices({ selectedId: foreignOrderId, search: "FOREIGN" })).toMatchObject({ total: 0, selected: null, items: [] })
    expect(await getReservationProjectChoices({ selectedId: foreignProjectId, search: "FOREIGN" })).toMatchObject({ total: 0, selected: null, items: [] })
  })
  it("invalidates an order linked to a foreign client", async () => {
    await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { clientId: foreignClientId } })
    try { expect((await getReservationOrderChoices({ selectedId: oldestOrderId })).selected).toBeNull() }
    finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { clientId } }) }
  })
  it("invalidates a project linked to a foreign client", async () => {
    await prisma.project.update({ where: { id: lastProjectId }, data: { clientId: foreignClientId } })
    try { expect((await getReservationProjectChoices({ selectedId: lastProjectId })).selected).toBeNull() }
    finally { await prisma.project.update({ where: { id: lastProjectId }, data: { clientId } }) }
  })
  it("does not validate a same-company order/project client mismatch", async () => {
    await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { clientId: otherClientId } })
    try { expect((await getReservationOrderChoices({ selectedId: oldestOrderId })).selected).toBeNull() }
    finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { clientId } }) }
  })
  it("does not validate a same-company project/site client mismatch", async () => {
    const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: otherClientId, agencyId: otherAgencyId, label: "Mismatched fictitious site", address1: "1 example street" } })
    await prisma.project.update({ where: { id: lastProjectId }, data: { siteId: site.id } })
    try { expect((await getReservationProjectChoices({ selectedId: lastProjectId })).selected).toBeNull() }
    finally { await prisma.project.update({ where: { id: lastProjectId }, data: { siteId: null } }); await prisma.customerSite.delete({ where: { id: site.id } }) }
  })
  it("does not validate an order/quote client mismatch", async () => {
    const quote = await prisma.quote.create({ data: { companyId: session.companyId, clientId: otherClientId, number: "FICTITIOUS-QUOTE", object: "Fictitious reference test" } })
    await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { quoteId: quote.id } })
    try { expect((await getReservationOrderChoices({ selectedId: oldestOrderId })).selected).toBeNull() }
    finally { await prisma.customerOrder.update({ where: { id: oldestOrderId }, data: { quoteId: null } }); await prisma.quote.delete({ where: { id: quote.id } }) }
  })
  it("returns only id and label, with no financial or nested identity payload", async () => {
    for (const result of [await getReservationOrderChoices({ selectedId: oldestOrderId }), await getReservationProjectChoices({ selectedId: lastProjectId })]) {
      for (const option of [...result.items, result.selected!]) expect(Object.keys(option).sort()).toEqual(["id", "label"])
    }
  })
  it("supports read-only demo and Viewer without stock or audit writes", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } }); vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getReservationOrderChoices()).total).toBe(150)
    expect((await getReservationProjectChoices()).total).toBe(300)
    expect(await prisma.stockReservation.count({ where: { companyId: session.companyId } })).toBe(0)
    expect(await prisma.auditLog.count({ where: { userId: session.userId } })).toBe(0)
  })
  it("rejects suspended and unauthenticated access before business queries", async () => {
    const orders = vi.spyOn(prisma.customerOrder, "count"), projects = vi.spyOn(prisma.project, "count")
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getReservationOrderChoices()).rejects.toThrow(); await expect(getReservationProjectChoices()).rejects.toThrow()
    session.authenticated = false
    await expect(getReservationOrderChoices()).rejects.toThrow("Authentification requise"); await expect(getReservationProjectChoices()).rejects.toThrow("Authentification requise")
    expect(orders).not.toHaveBeenCalled(); expect(projects).not.toHaveBeenCalled()
  })
  for (const input of [{ page: 0 }, { page: 1.5 }, { search: "x".repeat(201) }, { selectedId: "bad" }, { companyId: "foreign" }]) {
    it(`validates the reference query ${JSON.stringify(input)}`, async () => {
      await expect(getReservationOrderChoices(input)).rejects.toThrow(); await expect(getReservationProjectChoices(input)).rejects.toThrow()
    })
  }
})
