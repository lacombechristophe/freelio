import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { parseDirectoryQuery } from "@/lib/directory-query"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClients } from "@/actions/clients"
import { getClientDirectory } from "@/actions/directories"

describe.sequential("client directory respects Finance reading permissions", () => {
  let membershipId: string, agencyId: string, clientId: string, foreignCompanyId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional client directory permissions" } })).id
    session.userId = (await prisma.user.create({ data: { email: `client-directory-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign directory" } })).id
    const agency = await prisma.agency.create({ data: { companyId: session.companyId, code: "PERMITTED", name: "Fictional assigned agency" } })
    agencyId = agency.id
    await prisma.agencyMembership.create({ data: { agencyId: agency.id, membershipId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional directory customer", totalRevenueCents: 999999, totalUnpaidCents: 888888 } })
    clientId = client.id
    await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional empty customer" } })
    const project = await prisma.project.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: agency.id, name: "Fictional directory project" } })
    await prisma.invoice.create({ data: { companyId: session.companyId, clientId: client.id, projectId: project.id, number: "PERMITTED", object: "Fictional directory invoice", dueDate: new Date("2030-01-01"), status: "PAID", totalHtCents: 100, totalTvaCents: 0, totalTtcCents: 100, paidAmountCents: 100 } })
    await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: "UNPAID", object: "Fictional outstanding invoice", dueDate: new Date("2030-01-01"), status: "SENT", totalHtCents: 70, totalTvaCents: 0, totalTtcCents: 70, paidAmountCents: 20 } })
    const other = await prisma.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const otherProject = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: other.id, name: "Fictional other project" } })
    const foreignProject = await prisma.project.create({ data: { companyId: foreignCompanyId, clientId, name: "Fictional foreign project" } })
    for (const [number, companyId, projectId, amount] of [["OTHER", session.companyId, otherProject.id, 250], ["FOREIGN_PROJECT", session.companyId, foreignProject.id, 500], ["FOREIGN", foreignCompanyId, foreignProject.id, 600]] as const) {
      await prisma.invoice.create({ data: { companyId, clientId, projectId, number, object: "Fictional directory scope", dueDate: new Date("2030-01-01"), status: "PAID", totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount, paidAmountCents: amount } })
    }
    await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign directory customer" } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.agency.update({ where: { id: agencyId }, data: { active: true } })
    await prisma.agencyMembership.upsert({ where: { agencyId_membershipId: { agencyId, membershipId } }, update: {}, create: { agencyId, membershipId } })
  })
  afterAll(async () => {
    const companyId = { in: [session.companyId, foreignCompanyId] }
    await prisma.invoice.deleteMany({ where: { companyId } })
    await prisma.project.deleteMany({ where: { companyId } })
    await prisma.client.deleteMany({ where: { companyId } })
    await prisma.company.deleteMany({ where: { id: companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["OWNER", "ACCOUNTING"])("keeps authorized %s financial values", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const legacy = (await getClients()).clients.find(client => client.id === clientId)!
    const directory = (await getClientDirectory(parseDirectoryQuery(null))).rows.find(client => client.id === clientId)!
    for (const client of [legacy, directory]) {
      expect(client.totalRevenueCents).toBe(role === "OWNER" ? 350 : 100)
      expect(client.totalUnpaidCents).toBe(50)
    }
  })
  it.each(["TECHNICIAN", "SERVICE", "SALES"].flatMap(role => ["legacy", "directory"].map(reader => ({ role, reader }))))("does not return financial values to $role through $reader", async ({ role, reader }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const clients = reader === "legacy" ? (await getClients()).clients : (await getClientDirectory(parseDirectoryQuery(null))).rows
    expect(clients).toHaveLength(2)
    for (const client of clients) {
      expect(client.totalRevenueCents).toBeNull()
      expect(client.totalUnpaidCents).toBeNull()
    }
  })
  it.each(["revenue", "unpaid"].flatMap(field => ["equals", "not_equals", "contains", "greater_than", "less_than", "is_not_empty"].map(operator => ({ field, operator }))))("does not expose $field through a hidden $operator comparison", async ({ field, operator }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const query = parseDirectoryQuery(null)
    query.filters = [{ id: "finance", field, operator: operator as typeof query.filters[number]["operator"], value: operator === "greater_than" ? "-1" : "10000" }]
    expect((await getClientDirectory(query)).total).toBe(0)
  })
  it.each(["revenue", "unpaid"])("reports %s as unavailable for every client without Finance", async field => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const query = { ...parseDirectoryQuery(null), filters: [{ id: "finance", field, operator: "is_empty" as const, value: "" }] }
    expect((await getClientDirectory(query)).total).toBe(2)
  })
  it.each(["asc", "desc"])("keeps hidden financial sorting %s stable by ID", async direction => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    const result = await getClientDirectory({ ...parseDirectoryQuery(null), sort: { field: "revenue", direction: direction as "asc" | "desc" } })
    expect(result.rows.map(client => client.id)).toEqual(result.rows.map(client => client.id).sort())
  })
  it("does not even read invoice aggregates without Finance", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    const spy = vi.spyOn(prisma.invoice, "groupBy")
    try {
      await getClients()
      await getClientDirectory(parseDirectoryQuery(null))
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
  it.each(["inactive", "unassigned"])("rereads %s agency access before returning amounts", async condition => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "ACCOUNTING" } })
    if (condition === "inactive") await prisma.agency.update({ where: { id: agencyId }, data: { active: false } })
    else await prisma.agencyMembership.deleteMany({ where: { agencyId, membershipId } })
    const result = await getClientDirectory(parseDirectoryQuery(null))
    expect(result.rows.every(client => client.totalRevenueCents === 0 && client.totalUnpaidCents === 0)).toBe(true)
  })
  it("does not return foreign clients through a searched directory", async () => {
    const result = await getClientDirectory({ ...parseDirectoryQuery(null), search: "Foreign directory customer" })
    expect(result.rows).toEqual([])
  })
  it("refuses suspended membership in both readers", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getClients()).rejects.toThrow("plus accès")
    await expect(getClientDirectory(parseDirectoryQuery(null))).rejects.toThrow("plus accès")
  })
  it("keeps nonfinancial directory reads available in the public demo without writing", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClientDirectory(parseDirectoryQuery(null))).rows.every(client => client.totalRevenueCents === null)).toBe(true)
  })
})
