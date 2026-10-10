import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { getClientById, getClients, getClientsMinimal } from "@/actions/clients"

describe.sequential("financial client profile fields in real SQL responses", () => {
  let membershipId: string, clientId: string, foreignCompanyId: string, foreignClientId: string
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional client profile permission probe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `client-profile-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional financial profile", renewalAmountCents: 12345 } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign financial profile" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Foreign financial profile", renewalAmountCents: 77777 } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  it.each(["SALES", "OPERATIONS", "TECHNICIAN", "SERVICE"].flatMap(role => ["list", "detail"].map(reader => ({ role, reader }))))("does not disclose the unused renewal field through $reader to $role", async ({ role, reader }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const client = reader === "list" ? (await getClients()).clients[0] : await getClientById(clientId)
    expect(client?.renewalAmountCents).toBeNull()
    expect((await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).renewalAmountCents).toBe(12345)
  })
  it.each(["OWNER", "ADMIN", "ACCOUNTING", "VIEWER"].flatMap(role => ["list", "detail"].map(reader => ({ role, reader }))))("preserves the authorized renewal field through $reader for $role", async ({ role, reader }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const client = reader === "list" ? (await getClients()).clients[0] : await getClientById(clientId)
    expect(client?.renewalAmountCents).toBe(12345)
  })
  it("does not return or read a foreign-company financial profile", async () => {
    expect((await getClients()).clients.map(client => client.id)).toEqual([clientId])
    expect(await getClientById(foreignClientId)).toBeNull()
  })
  it("keeps the minimal reader free of financial fields", async () => {
    expect(await getClientsMinimal()).toEqual([{ id: clientId, name: "Fictional financial profile" }])
  })
  it("rereads a revoked role with the same session", async () => {
    expect((await getClients()).clients[0].renewalAmountCents).toBe(12345)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    expect((await getClients()).clients[0].renewalAmountCents).toBeNull()
  })
  it("refuses both financial profile readers after suspension", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(getClients()).rejects.toThrow("plus accès")
    await expect(getClientById(clientId)).rejects.toThrow("plus accès")
  })
  it("keeps public-demo consultation without the inaccessible renewal field", async () => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SERVICE" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getClients()).clients[0].renewalAmountCents).toBeNull()
    expect((await getClientById(clientId))?.renewalAmountCents).toBeNull()
  })
})
