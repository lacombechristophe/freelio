import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { withAuth } from "@/lib/auth-wrapper"

describe.sequential("cached Prisma authorization across module reloads", () => {
  let clientId: string, foreignCompanyId: string, foreignClientId: string, membershipId: string, foreignMembershipId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional context reload recipe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `context-reload-${randomUUID()}@example.test` } })).id
    const member = await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "VIEWER", status: "ACTIVE" } })
    membershipId = member.id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional reload client" } })).id
    for (const [code, amount] of [["LOCAL", 10000], ["OTHER", 20000]] as const) {
      const agency = await prisma.agency.create({ data: { companyId: session.companyId, code, name: `Fictional ${code} agency` } })
      if (code === "LOCAL") await prisma.agencyMembership.create({ data: { membershipId: member.id, agencyId: agency.id } })
      const project = await prisma.project.create({ data: { companyId: session.companyId, clientId, agencyId: agency.id, name: `Fictional ${code} project` } })
      await prisma.invoice.create({ data: { companyId: session.companyId, clientId, projectId: project.id, number: code, object: "Fictional invoice", status: "SENT", dueDate: new Date("2026-01-01"), totalHtCents: amount, totalTvaCents: 0, totalTtcCents: amount } })
    }
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign reload recipe" } })).id
    foreignMembershipId = (await prisma.membership.create({ data: { companyId: foreignCompanyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign client" } })).id
  })
  afterEach(async () => {
    await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional reload client" } })
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
  })
  afterAll(async () => {
    await prisma.invoice.deleteMany({ where: { companyId: session.companyId } })
    await prisma.project.deleteMany({ where: { companyId: session.companyId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("scopes invoices before loading another context module", async () => {
    expect((await withAuth(() => prisma.invoice.aggregate({ where: { companyId: session.companyId }, _sum: { totalTtcCents: true } }), "finance.read"))._sum.totalTtcCents).toBe(10000)
  })
  it("reuses the context store across module loads", async () => {
    vi.resetModules()
    const reloaded = await import("@/lib/context")
    expect(reloaded.requestContext).toBe(requestContext)
  })
  it("keeps agency scoping with the cached Prisma client after a reload", async () => {
    vi.resetModules()
    const reloaded = await import("@/lib/auth-wrapper")
    expect((await reloaded.withAuth(() => prisma.invoice.aggregate({ where: { companyId: session.companyId }, _sum: { totalTtcCents: true } }), "finance.read"))._sum.totalTtcCents).toBe(10000)
  })
  it("keeps tenant scoping after a reload", async () => {
    vi.resetModules()
    const reloaded = await import("@/lib/auth-wrapper")
    const clients = await reloaded.withAuth(() => prisma.client.findMany({ where: { id: { in: [clientId, foreignClientId] } }, select: { id: true } }), "crm.read")
    expect(clients.map(client => client.id)).toEqual([clientId])
  })
  it("refuses forbidden writes after a reload", async () => {
    vi.resetModules()
    const reloaded = await import("@/lib/auth-wrapper")
    await expect(reloaded.withAuth(() => prisma.client.update({ where: { id: clientId }, data: { name: "Fictional forbidden update" } }), "crm.read")).rejects.toThrow("FORBIDDEN:crm.write")
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).name).toBe("Fictional reload client")
  })
  it("preserves Owner company-wide totals after a reload", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    vi.resetModules()
    const reloaded = await import("@/lib/auth-wrapper")
    expect((await reloaded.withAuth(() => prisma.invoice.aggregate({ where: { companyId: session.companyId }, _sum: { totalTtcCents: true } }), "finance.read"))._sum.totalTtcCents).toBe(30000)
  })
  it("keeps concurrent tenant contexts separate across modules", async () => {
    vi.resetModules()
    const reloadedContext = await import("@/lib/context")
    const reloadedAuth = await import("@/lib/auth-wrapper")
    const local = (await reloadedAuth.resolveAuthContext())!
    const foreign = { ...local, companyId: foreignCompanyId, membershipId: foreignMembershipId, role: "OWNER" as const, agencyIds: null }
    const read = async () => {
      await Promise.resolve()
      return (await prisma.client.findMany({ where: { id: { in: [clientId, foreignClientId] } }, select: { id: true } })).map(client => client.id)
    }
    expect(await Promise.all([requestContext.run(local, read), reloadedContext.requestContext.run(foreign, read)])).toEqual([[clientId], [foreignClientId]])
  })
  it("rereads an agency revocation after a reload", async () => {
    const assignment = await prisma.agencyMembership.findFirstOrThrow({ where: { membershipId } })
    await prisma.agencyMembership.delete({ where: { agencyId_membershipId: { agencyId: assignment.agencyId, membershipId } } })
    try {
      vi.resetModules()
      const reloaded = await import("@/lib/auth-wrapper")
      expect(await reloaded.withAuth(() => prisma.project.findMany({ where: { companyId: session.companyId }, select: { id: true } }), "operations.read")).toEqual([])
    } finally {
      await prisma.agencyMembership.create({ data: { agencyId: assignment.agencyId, membershipId } })
    }
  })
})
