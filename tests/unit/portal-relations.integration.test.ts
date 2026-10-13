import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"

const session = vi.hoisted(() => ({ userId: "", companyId: "", token: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => session.token ? { value: session.token } : undefined }) }))
vi.mock("@/lib/rate-limit", () => ({ portalRateLimit: { limit: async () => ({ success: true }) } }))

import prisma from "@/lib/prisma"
import { createPortalToken, getCurrentPortalAccess, getPortalAccessFromToken, hashPortalToken } from "@/lib/portal/session"
import { revokeClientPortalAccess, updateClientPortalAppointment } from "@/actions/portal"
import { GET } from "@/app/portal/access/[token]/route"

describe.sequential("Portal access and actions reject incoherent tenant and contact references", () => {
  let companyId: string, foreignCompanyId: string, clientId: string, otherClientId: string, foreignClientId: string
  let ownContactId: string, otherContactId: string, foreignContactId: string, membershipId: string
  const access = async (overrides: { clientId?: string; contactId?: string; revokedAt?: Date; expiresAt?: Date } = {}) => {
    const token = createPortalToken()
    const row = await prisma.clientPortalAccess.create({ data: { companyId, clientId, tokenHash: hashPortalToken(token), expiresAt: new Date(Date.now() + 3_600_000), ...overrides } })
    return { row, token }
  }
  const appointment = (party = clientId, tenant = companyId) => prisma.clientPortalAppointmentRequest.create({
    data: { companyId: tenant, clientId: party, subject: "Fictional portal request", preferredStart: new Date("2026-10-20T10:00:00Z") },
  })
  const audits = () => prisma.auditLog.count({ where: { userId: session.userId } })

  beforeAll(async () => {
    companyId = session.companyId = (await prisma.company.create({ data: { name: "Fictional portal relations" } })).id
    foreignCompanyId = (await prisma.company.create({ data: { name: "Fictional foreign portal relations" } })).id
    session.userId = (await prisma.user.create({ data: { email: `portal-relations-${randomUUID()}@example.test` } })).id
    membershipId = (await prisma.membership.create({ data: { companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await prisma.client.create({ data: { companyId, name: "Fictional portal client" } })).id
    otherClientId = (await prisma.client.create({ data: { companyId, name: "Fictional other portal client" } })).id
    foreignClientId = (await prisma.client.create({ data: { companyId: foreignCompanyId, name: "Fictional foreign portal client" } })).id
    const contact = (party: string) => prisma.contact.create({ data: { clientId: party, firstName: "Fictional", lastName: "Contact" } })
    ownContactId = (await contact(clientId)).id
    otherContactId = (await contact(otherClientId)).id
    foreignContactId = (await contact(foreignClientId)).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs(); session.token = ""
    await prisma.membership.update({ where: { id: membershipId }, data: { role: "OWNER", status: "ACTIVE" } })
    await prisma.auditLog.deleteMany({ where: { userId: session.userId } })
    await prisma.clientPortalAccess.deleteMany({ where: { companyId } })
    await prisma.clientPortalAppointmentRequest.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
  })
  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [companyId, foreignCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } })
    await prisma.user.delete({ where: { id: session.userId } })
  })

  it.each([false, true])("retains a coherent access with contact=%s", async withContact => {
    const { token } = await access(withContact ? { contactId: ownContactId } : {})
    expect(await getPortalAccessFromToken(token)).toMatchObject({ companyId, clientId })
    session.token = token
    expect((await getCurrentPortalAccess())?.clientId).toBe(clientId)
  })
  it.each(["foreignClient", "otherContact", "foreignContact"])("rejects %s without changing its historical row", async kind => {
    const { row, token } = await access(kind === "foreignClient" ? { clientId: foreignClientId } : { contactId: kind === "otherContact" ? otherContactId : foreignContactId })
    expect(await getPortalAccessFromToken(token)).toBeNull()
    await expect(revokeClientPortalAccess(row.id)).rejects.toThrow("Accès portail introuvable")
    expect(await prisma.clientPortalAccess.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row)
    expect(await audits()).toBe(0)
  })
  it.each(["expired", "revoked"])("keeps %s tokens invalid", async kind => {
    const { token } = await access(kind === "expired" ? { expiresAt: new Date(0) } : { revokedAt: new Date() })
    expect(await getPortalAccessFromToken(token)).toBeNull()
  })
  it("rejects malformed and absent tokens", async () => {
    expect(await getPortalAccessFromToken("invalid")).toBeNull()
    expect(await getPortalAccessFromToken(createPortalToken())).toBeNull()
    expect(await getCurrentPortalAccess()).toBeNull()
  })
  it.each(["client", "contact"])("rechecks the %s relation on every existing session read", async kind => {
    const { row, token } = await access({ contactId: ownContactId }); session.token = token
    expect((await getCurrentPortalAccess())?.id).toBe(row.id)
    await prisma.clientPortalAccess.update({ where: { id: row.id }, data: kind === "client" ? { clientId: foreignClientId } : { contactId: otherContactId } })
    expect(await getCurrentPortalAccess()).toBeNull()
    expect(await audits()).toBe(0)
  })
  it("clears the portal cookie on a rejected entry without touching lastUsedAt", async () => {
    const { row, token } = await access({ clientId: foreignClientId })
    const response = await GET(new Request(`https://example.test/portal/access/${token}`), { params: Promise.resolve({ token }) })
    expect(response.headers.get("location")).toBe("https://example.test/portal?error=invalid")
    expect(response.cookies.get("crm_portal_session")?.value).toBe("")
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect((await prisma.clientPortalAccess.findUniqueOrThrow({ where: { id: row.id } })).lastUsedAt).toBeNull()
  })
  it("rejects a token whose party changes between reference lookup and document lookup", async () => {
    const { row, token } = await access()
    const read = prisma.clientPortalAccess.findFirst.bind(prisma.clientPortalAccess)
    vi.spyOn(prisma.clientPortalAccess, "findFirst").mockImplementationOnce((async (args: Parameters<typeof read>[0]) => {
      const result = await read(args)
      await prisma.clientPortalAccess.update({ where: { id: row.id }, data: { clientId: foreignClientId } })
      return result
    }) as typeof prisma.clientPortalAccess.findFirst)
    expect(await getPortalAccessFromToken(token)).toBeNull()
  })
  it("rejects a revocation whose party changes after its initial lookup", async () => {
    const { row } = await access()
    const read = prisma.clientPortalAccess.findFirst.bind(prisma.clientPortalAccess)
    vi.spyOn(prisma.clientPortalAccess, "findFirst").mockImplementationOnce((async (args: Parameters<typeof read>[0]) => {
      const result = await read(args)
      await prisma.clientPortalAccess.update({ where: { id: row.id }, data: { clientId: foreignClientId } })
      return result
    }) as typeof prisma.clientPortalAccess.findFirst)
    await expect(revokeClientPortalAccess(row.id)).rejects.toThrow("Accès portail introuvable")
    expect(await prisma.clientPortalAccess.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ clientId: foreignClientId, revokedAt: null })
    expect(await audits()).toBe(0)
  })
  it("rejects a confirmation whose party changes after its initial lookup", async () => {
    const request = await appointment()
    const read = prisma.clientPortalAppointmentRequest.findFirst.bind(prisma.clientPortalAppointmentRequest)
    vi.spyOn(prisma.clientPortalAppointmentRequest, "findFirst").mockImplementationOnce((async (args: Parameters<typeof read>[0]) => {
      const result = await read(args)
      await prisma.clientPortalAppointmentRequest.update({ where: { id: request.id }, data: { clientId: foreignClientId } })
      return result
    }) as typeof prisma.clientPortalAppointmentRequest.findFirst)
    await expect(updateClientPortalAppointment({ id: request.id, status: "CONFIRMED" })).rejects.toThrow("Demande de rendez-vous introuvable")
    expect(await prisma.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ clientId: foreignClientId, status: "PENDING", response: null })
    expect(await audits()).toBe(0)
  })
  it.each(["OWNER", "ADMIN", "SALES"])("preserves coherent confirmation and revocation for %s", async role => {
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const request = await appointment(), { row, token } = await access({ contactId: ownContactId })
    await updateClientPortalAppointment({ id: request.id, status: "CONFIRMED", response: "Fictional accepted response" })
    expect(await prisma.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: request.id } })).toMatchObject({ status: "CONFIRMED", response: "Fictional accepted response" })
    await revokeClientPortalAccess(row.id)
    expect(await getPortalAccessFromToken(token)).toBeNull()
    expect(await audits()).toBe(2)
  })
  it.each(["OPERATIONS", "TECHNICIAN", "SERVICE", "ACCOUNTING", "VIEWER"])("denies mutations for %s", async role => {
    const request = await appointment(), { row } = await access()
    await prisma.membership.update({ where: { id: membershipId }, data: { role } })
    const accessRead = vi.spyOn(prisma.clientPortalAccess, "findFirst"), appointmentRead = vi.spyOn(prisma.clientPortalAppointmentRequest, "findFirst")
    await expect(revokeClientPortalAccess(row.id)).rejects.toThrow("droits nécessaires")
    await expect(updateClientPortalAppointment({ id: request.id, status: "CONFIRMED" })).rejects.toThrow("droits nécessaires")
    expect(accessRead).not.toHaveBeenCalled(); expect(appointmentRead).not.toHaveBeenCalled()
    expect(await audits()).toBe(0)
  })
  it.each(["PENDING", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"])("refuses the %s update of a foreign client request before mutation or audit", async status => {
    const request = await appointment(foreignClientId)
    await expect(updateClientPortalAppointment({ id: request.id, status, response: "Fictional response" })).rejects.toThrow("Demande de rendez-vous introuvable")
    expect(await prisma.clientPortalAppointmentRequest.findUniqueOrThrow({ where: { id: request.id } })).toEqual(request)
    expect(await audits()).toBe(0)
  })
  it("refuses a request belonging to another company", async () => {
    const request = await appointment(foreignClientId, foreignCompanyId)
    await expect(updateClientPortalAppointment({ id: request.id, status: "CONFIRMED" })).rejects.toThrow("Demande de rendez-vous introuvable")
    expect(await audits()).toBe(0)
  })
  it("retains already revoked coherent links and permits a repeated revocation", async () => {
    const { row } = await access({ revokedAt: new Date() })
    await revokeClientPortalAccess(row.id)
    expect((await prisma.clientPortalAccess.findUniqueOrThrow({ where: { id: row.id } })).revokedAt).toEqual(row.revokedAt)
  })
  it("rechecks membership before mutating", async () => {
    const request = await appointment(), { row } = await access()
    await prisma.membership.update({ where: { id: membershipId }, data: { status: "INACTIVE" } })
    await expect(revokeClientPortalAccess(row.id)).rejects.toThrow("plus accès")
    await expect(updateClientPortalAppointment({ id: request.id, status: "CONFIRMED" })).rejects.toThrow("plus accès")
    expect(await audits()).toBe(0)
  })
  it("keeps coherent token reads but denies writes in public demo mode", async () => {
    const { row, token } = await access(), request = await appointment()
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    expect((await getPortalAccessFromToken(token))?.id).toBe(row.id)
    await expect(revokeClientPortalAccess(row.id)).rejects.toThrow(/démonstration/i)
    await expect(updateClientPortalAppointment({ id: request.id, status: "CONFIRMED" })).rejects.toThrow(/démonstration/i)
    expect(await audits()).toBe(0)
  })
})
