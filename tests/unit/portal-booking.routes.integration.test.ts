import { createDatabaseClient } from "@/lib/database-client"
import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "", token: "", origin: true }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => session.token ? { value: session.token } : undefined }) }))
vi.mock("@/lib/rate-limit", () => ({ portalRateLimit: { limit: async () => ({ success: true }) } }))
vi.mock("@/lib/portal/notifications", () => ({ notifyPortalTeam: vi.fn() }))
vi.mock("@/lib/automations/engine", () => ({ enqueueAutomationEvent: vi.fn(async () => "fictional-event"), dispatchAutomationEvent: vi.fn(async () => undefined) }))
import { createPortalToken, hashPortalToken } from "@/lib/portal/session"
import { GET, POST } from "@/app/api/portal/appointments/route"
import { GET as calendar } from "@/app/api/organisation/calendar.ics/route"
import { resolveBookingLocalTime } from "@/lib/scheduling/booking-time"

const db = createDatabaseClient()
describe.sequential("portal booking routes keep session, client and wall-time boundaries", () => {
  let clientId: string, otherClientId: string, memberId: string
  beforeEach(async () => {
    session.origin = true
    session.companyId = (await db.company.create({ data: { name: "Fictional portal route", serviceTimezone: "Europe/Paris" } })).id
    session.userId = (await db.user.create({ data: { email: `${randomUUID()}@example.test` } })).id
    memberId = (await db.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    clientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional route client" } })).id
    otherClientId = (await db.client.create({ data: { companyId: session.companyId, name: "Fictional private client" } })).id
    session.token = createPortalToken()
    await db.clientPortalAccess.create({ data: { companyId: session.companyId, clientId, tokenHash: hashPortalToken(session.token), expiresAt: new Date(Date.now() + 3_600_000) } })
  })
  afterEach(async () => {
    vi.unstubAllEnvs(); vi.restoreAllMocks()
    await db.client.deleteMany({ where: { companyId: session.companyId } }); await db.company.delete({ where: { id: session.companyId } }); await db.user.delete({ where: { id: session.userId } })
  })
  afterAll(async () => { await db.$disconnect() })
  const local = () => `${new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)}T10:00`
  const post = (body = {}) => POST(new Request("https://example.test/api/portal/appointments", { method: "POST", headers: { origin: "https://example.test", "content-type": "application/json" },
    body: JSON.stringify({ subject: "Fictional general appointment", preferredStart: local(), timeZone: "Europe/Paris", durationMinutes: 60, ...body }) }))
  it("stores a preference in the company zone without reserving a member or requiring a site", async () => {
    expect((await post()).status).toBe(201)
    const row = await db.clientPortalAppointmentRequest.findFirstOrThrow({ where: { clientId } })
    expect(row).toMatchObject({ preferredStart: resolveBookingLocalTime(local(), "Europe/Paris").date, status: "PENDING", assignedMembershipId: null, scheduledStart: null })
  })
  it("accepts an explicit API offset without host-zone conversion", async () => {
    const explicit = new Date(Date.now() + 7 * 86_400_000).toISOString()
    expect((await post({ preferredStart: explicit })).status).toBe(201)
    expect((await db.clientPortalAppointmentRequest.findFirstOrThrow({ where: { clientId } })).preferredStart.toISOString()).toBe(explicit)
  })
  it.each([{ preferredStart: "2027-02-31T10:00" }, { alternativeStart: "invalid" }, { alternativeStart: "2020-01-01T10:00" }, { preferredStart: "2027-03-28T02:30" }, { durationMinutes: 481 }])("refuses malformed or invalid preference %j atomically", async body => {
    expect((await post(body)).status).toBe(400); expect(await db.clientPortalAppointmentRequest.count({ where: { clientId } })).toBe(0)
  })
  it("refuses a stale company zone", async () => expect((await post({ timeZone: "UTC" })).status).toBe(409))
  it("rejects an absent or revoked session on reads and writes", async () => {
    await db.clientPortalAccess.updateMany({ where: { clientId }, data: { revokedAt: new Date() } })
    expect((await GET(new Request("https://example.test/api/portal/appointments"))).status).toBe(401)
    expect((await post()).status).toBe(401)
    session.token = ""; expect((await post()).status).toBe(401)
  })
  it("rejects a cross-origin write before accepting a preference", async () => {
    const response = await POST(new Request("https://example.test/api/portal/appointments", { method: "POST", headers: { origin: "https://foreign.test" }, body: "{}" }))
    expect(response.status).toBe(403)
  })
  it("paginates all own requests without another client's history", async () => {
    for (let i = 0; i < 27; i++) await db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId, subject: `Fictional ${i}`, preferredStart: new Date() } })
    await db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId: otherClientId, subject: "PRIVATE-OTHER-CLIENT", preferredStart: new Date() } })
    const response = await GET(new Request("https://example.test/api/portal/appointments?page=2")), body = await response.json()
    expect(body.total).toBe(27); expect(body.items).toHaveLength(2); expect(JSON.stringify(body)).not.toContain("PRIVATE-OTHER-CLIENT"); expect(response.headers.get("cache-control")).toContain("no-store")
  })
  it("exports actual UTC booking instants, excludes cancelled and legacy confirmations, and escapes line breaks", async () => {
    const start = resolveBookingLocalTime(local(), "Europe/Paris").date!, end = new Date(start.getTime() + 3_600_000)
    const row = await db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId, subject: "Fictional\r\nBEGIN:VEVENT", preferredStart: start,
      assignedMembershipId: memberId, status: "CONFIRMED", scheduledStart: start, scheduledEnd: end } })
    await db.clientPortalAppointmentRequest.create({ data: { companyId: session.companyId, clientId, subject: "Legacy", preferredStart: start, status: "CONFIRMED" } })
    const response = await calendar(), body = await response.text()
    expect(response.status).toBe(200); expect(body.match(/BEGIN:VEVENT/g)).toHaveLength(2) // one event plus escaped text in SUMMARY
    expect(body).toContain(`DTSTART:${start.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")}`)
    expect(body).toContain("SUMMARY:Fictional\\nBEGIN:VEVENT"); expect(body).not.toContain("SUMMARY:Legacy")
    await db.clientPortalAppointmentRequest.update({ where: { id: row.id }, data: { status: "CANCELLED" } })
    expect(await (await calendar()).text()).not.toContain(`portal-${row.id}`)
  })
})
