import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
import prisma from "@/lib/prisma"
import { createClient, updateClient, setClientNextAction } from "@/actions/clients"

describe.sequential("client mutation response permissions on real SQL", () => {
  let membershipId: string, clientId: string, foreignCompanyId: string, foreignClientId: string
  const form = { name: "Fictional edited client", type: "ENTERPRISE", address: "Fictional address" }
  beforeAll(async () => {
    session.companyId = (await prisma.company.create({ data: { name: "Fictional client mutation recipe" } })).id
    session.userId = (await prisma.user.create({ data: { email: `client-mutation-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId: session.companyId, name: "Fictional protected client", relationScore: 37, totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345 } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign mutation client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign client" } })).id
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
  })
  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.client.deleteMany({ where: { companyId: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [session.companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })
  async function mutate(action: string) {
    if (action === "create") return createClient(form)
    if (action === "update") return updateClient(clientId, form)
    return setClientNextAction(clientId, { label: "Fictional next action", date: "2026-12-01" })
  }
  it.each(["SALES", "OWNER", "ADMIN"].flatMap(role => ["create", "update", "next"].map(action => ({ role, action }))))("restricts the $action response for $role while preserving stored fields", async ({ role, action }) => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const result = await mutate(action)
    const stored = await prisma.client.findUniqueOrThrow({ where: { id: result!.id } })
    for (const field of ["totalRevenueCents", "totalUnpaidCents", "renewalAmountCents", "relationScore"] as const) expect(result![field]).toBe(role === "SALES" ? null : stored[field])
    if (action !== "create") expect(stored).toMatchObject({ relationScore: 37, totalRevenueCents: 45678, totalUnpaidCents: 9876, renewalAmountCents: 12345 })
    expect(result!.name).toBe(stored.name)
    if (action !== "next") expect(result!.name).toBe(form.name)
    else expect(result!.nextActionLabel).toBe("Fictional next action")
  })
  it.each(["create", "update", "next"])("refuses %s in the readonly demo without changing clients", async action => {
    const before = await prisma.client.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } })
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    await expect(mutate(action)).rejects.toThrow(/démonstration|lecture seule/)
    expect(await prisma.client.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } })).toEqual(before)
  })
  it.each(["create", "update", "next"])("refuses %s without CRM write permission", async action => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "VIEWER" } })
    const count = await prisma.client.count({ where: { companyId: session.companyId } })
    await expect(mutate(action)).rejects.toThrow("FORBIDDEN:crm.write")
    expect(await prisma.client.count({ where: { companyId: session.companyId } })).toBe(count)
  })
  it.each(["update", "next"])("refuses a foreign client during %s", async action => {
    if (action === "update") await expect(updateClient(foreignClientId, form)).rejects.toThrow("introuvable")
    else await expect(setClientNextAction(foreignClientId, { label: "Fictional refused action" })).rejects.toThrow("introuvable")
    expect((await prisma.client.findUniqueOrThrow({ where: { id: foreignClientId } })).name).toBe("Fictional foreign client")
  })
  it.each(["create", "update", "next"])("refuses %s after membership suspension", async action => {
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "SUSPENDED" } })
    await expect(mutate(action)).rejects.toThrow("plus accès")
  })
  it("rereads permissions after a role downgrade with the same session", async () => {
    expect((await mutate("update"))?.totalRevenueCents).toBe(45678)
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    expect((await mutate("update"))?.totalRevenueCents).toBeNull()
  })
  it("does not accept financial caches or a health score in the profile form", async () => {
    const result = await createClient({ ...form, totalRevenueCents: 88888, totalUnpaidCents: 77777, renewalAmountCents: 66666, relationScore: 1 })
    expect(await prisma.client.findUniqueOrThrow({ where: { id: result!.id } })).toMatchObject({ totalRevenueCents: 0, totalUnpaidCents: 0, renewalAmountCents: 0, relationScore: 100 })
  })
})
