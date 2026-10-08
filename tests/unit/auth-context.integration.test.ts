import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"

describe.sequential("lazy Prisma promises retain their authorization context", () => {
  let clientId: string, foreignClientId: string, foreignCompanyId: string, membershipId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional lazy query authorization" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign query authorization" } })).id
    session.userId = (await prisma.user.create({ data: { email: `lazy-auth-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "SERVICE", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional local customer", renewalAmountCents: 12345 } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign customer" } })).id
  })
  afterEach(async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    await prisma.client.update({ where: { id: clientId }, data: { name: "Fictional local customer", renewalAmountCents: 12345, nextActionLabel: null } })
    await prisma.client.update({ where: { id: foreignClientId }, data: { nextActionLabel: null } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it("refuses general Client editing through a service action", async () => {
    await expect(withAuth(() => prisma.client.update({ where: { id: clientId }, data: { name: "Unauthorized rename" } }), "service.write")).rejects.toThrow("FORBIDDEN:crm.write")
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).name).toBe("Fictional local customer")
  })
  it("refuses financial Client editing through a service action", async () => {
    await expect(withAuth(() => prisma.client.update({ where: { id: clientId }, data: { renewalAmountCents: 0 } }), "service.write")).rejects.toThrow("FORBIDDEN:crm.write")
  })
  it("refuses nested Client writes through a service action", async () => {
    await expect(withAuth(() => prisma.client.update({ where: { id: clientId }, data: { contacts: { deleteMany: {} } } }), "service.write")).rejects.toThrow("FORBIDDEN:crm.write")
  })
  it("refuses bulk profile writes through a service action", async () => {
    await expect(withAuth(() => prisma.client.updateMany({ where: { companyId: session.companyId }, data: { nextActionLabel: "Unauthorized bulk update" } }), "service.write")).rejects.toThrow("FORBIDDEN:crm.write")
  })
  it("refuses profile writes through a service read action", async () => {
    await expect(withAuth(() => prisma.client.update({ where: { id: clientId }, data: { nextActionLabel: "Unauthorized read update" } }), "service.read")).rejects.toThrow("FORBIDDEN:crm.write")
  })
  it("keeps lazy Prisma reads inside their company authorization context", async () => {
    const clients = await withAuth(() => prisma.client.findMany({ select: { id: true } }), "crm.read")
    expect(clients.map(client => client.id)).toEqual([clientId])
  })
  it("scopes lazy Owner updates to their authorized company", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER" } })
    await expect(withAuth(() => prisma.client.update({ where: { id: foreignClientId }, data: { nextActionLabel: "Foreign update" } }), "crm.write")).rejects.toMatchObject({ code: "P2025" })
    expect((await prisma.client.findUniqueOrThrow({ where: { id: foreignClientId } })).nextActionLabel).toBeNull()
  })
})
