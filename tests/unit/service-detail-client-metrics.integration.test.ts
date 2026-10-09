import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getEquipmentDetail, getFieldInterventionDetail, getServiceTicketDetail } from "@/actions/operations"

describe.sequential("service details project client metrics through domain and agency permissions", () => {
  let membershipId: string, agencyId: string, equipmentId: string, interventionId: string, ticketId: string
  const metrics = { totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345, relationScore: 37 }
  const hidden = { totalRevenueCents: null, totalUnpaidCents: null, renewalAmountCents: null, relationScore: null }
  const readers = ["equipment", "intervention", "ticket"] as const
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional service detail metrics" } })).id
    session.userId = (await prisma.user.create({ data: { email: `service-metrics-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    agencyId = (await prisma.agency.create({ data: { companyId: session.companyId, code: "LOCAL", name: "Fictional service agency" } })).id
    await prisma.agencyMembership.create({ data: { agencyId, membershipId } })
    const client = await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional service client", ...metrics } })
    const site = await prisma.customerSite.create({ data: { companyId: session.companyId, clientId: client.id, agencyId, label: "Fictional service site", address1: "Fictional address" } })
    equipmentId = (await prisma.equipment.create({ data: { companyId: session.companyId, siteId: site.id, label: "Fictional service equipment" } })).id
    ticketId = (await prisma.serviceTicket.create({ data: { companyId: session.companyId, clientId: client.id, siteId: site.id, equipmentId, number: "METRICS", title: "Fictional service ticket", description: "Fictional issue" } })).id
    interventionId = (await prisma.fieldIntervention.create({ data: { companyId: session.companyId, siteId: site.id, ticketId, title: "Fictional intervention", scheduledStart: new Date("2030-01-01") } })).id
  })
  afterEach(async () => { await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } }) })
  afterAll(async () => {
    const where = { companyId: session.companyId }
    await prisma.fieldIntervention.deleteMany({ where })
    await prisma.serviceTicket.deleteMany({ where })
    await prisma.equipment.deleteMany({ where })
    await prisma.customerSite.deleteMany({ where })
    await prisma.client.deleteMany({ where })
    await prisma.company.delete({ where: { id: session.companyId } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function read(reader: typeof readers[number]) {
    if (reader === "equipment") return (await getEquipmentDetail(equipmentId))?.site.client
    if (reader === "intervention") return (await getFieldInterventionDetail(interventionId))?.site.client
    return (await getServiceTicketDetail(ticketId))?.client
  }
  it.each(readers.flatMap(reader => Object.keys(metrics).map(field => ({ reader, field }))))("excludes $field from $reader without Finance", async ({ reader, field }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect((await read(reader))?.[field as keyof typeof metrics]).toBeNull()
  })
  it.each(readers.flatMap(reader => (["OWNER", "ADMIN"] as const).map(role => ({ reader, role }))))("preserves global values for $role in $reader", async ({ reader, role }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    expect(await read(reader)).toMatchObject(metrics)
  })
  it.each(readers)("preserves authorized renewal but hides global caches for Viewer in %s", async reader => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    expect(await read(reader)).toMatchObject({ ...hidden, renewalAmountCents: metrics.renewalAmountCents })
  })
  it.each(readers)("reevaluates the role in the same session for %s", async reader => {
    expect(await read(reader)).toMatchObject(metrics)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "TECHNICIAN" } })
    expect(await read(reader)).toMatchObject(hidden)
  })
  it.each(readers)("preserves client identity and contacts for Service in %s", async reader => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    expect(await read(reader)).toMatchObject({ name: "Fictional service client", contacts: [], ...hidden })
  })
})
