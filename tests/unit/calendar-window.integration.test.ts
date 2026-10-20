import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const coordination = vi.hoisted(() => ({ beforeTransaction: null as (() => Promise<void>) | null }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", async original => {
  const actual = await original<typeof import("@/lib/prisma")>(), real = actual.default
  // Keep all SQL real; the hook inserts a committed reconnect just before
  // the actual page transaction begins, outside SQLite's writer lock.
  return { ...actual, default: new Proxy(real, { get(target, key) {
    if (key !== "$transaction") return Reflect.get(target, key)
    return async (...args: Parameters<typeof real.$transaction>) => {
      const before = coordination.beforeTransaction; coordination.beforeTransaction = null
      await before?.()
      return real.$transaction(...args)
    }
  } }) }
})
import prisma from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/crypto"
import { syncOAuthCalendarChannel } from "@/lib/communications/calendar-sync"
import * as emailProvider from "@/lib/communications/email-provider"

describe.sequential("calendar window and reconnect consistency on real SQL", () => {
  const companies: string[] = []
  let onRead: (() => Promise<void>) | undefined
  let provider: string, tokenCount: number, failureStatus: number
  const windows = new Map<string, { start: string; end: string }>()
  const events = ["2027-01-10T10:00:00Z", "2027-03-10T10:00:00Z"]
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-01-15T12:00:00Z"))
    windows.clear(); onRead = undefined; tokenCount = 0; failureStatus = 0; coordination.beforeTransaction = null
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      expect(init.method || "GET").toBe("GET")
      const url = new URL(String(input)), token = url.searchParams.get(provider === "GOOGLE" ? "syncToken" : "$deltatoken")
      if (failureStatus) return Response.json({ error: { message: "Simulated calendar failure" } }, { status: failureStatus })
      if (token) expect(windows.has(token)).toBe(true)
      const start = url.searchParams.get(provider === "GOOGLE" ? "timeMin" : "startDateTime")
      const end = url.searchParams.get(provider === "GOOGLE" ? "timeMax" : "endDateTime")
      const window = token ? windows.get(token)! : { start: start!, end: end! }
      expect(Number.isFinite(Date.parse(window.start))).toBe(true); expect(Number.isFinite(Date.parse(window.end))).toBe(true)
      const checkpoint = `fictional-calendar-${++tokenCount}`; windows.set(checkpoint, window)
      const listed = token ? [] : events.filter(date => Date.parse(date) >= Date.parse(window.start) && Date.parse(date) < Date.parse(window.end))
      const callback = onRead; onRead = undefined; await callback?.()
      return provider === "GOOGLE" ? Response.json({ items: listed.map(date => ({ id: date, summary: "Fictional unchanged event", start: { dateTime: date }, end: { dateTime: new Date(Date.parse(date) + 3_600_000).toISOString() } })), nextSyncToken: checkpoint })
        : Response.json({ value: listed.map(date => ({ id: date, subject: "Fictional unchanged event", start: { dateTime: date, timeZone: "UTC" }, end: { dateTime: new Date(Date.parse(date) + 3_600_000).toISOString(), timeZone: "UTC" } })), "@odata.deltaLink": `https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=${checkpoint}` })
    }))
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers() })
  afterAll(async () => {
    for (const id of companies) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "calendar-sync:" } } })
  })
  function credentials(accessToken = "fictional-access-token") {
    return { mode: "OAUTH", accessToken, refreshToken: "fictional-refresh-token", scope: "https://www.googleapis.com/auth/calendar.events Calendars.ReadWrite", expiresAt: "2029-01-01T00:00:00Z" }
  }
  async function fixture(value: string) {
    provider = value
    const company = await prisma.company.create({ data: { name: "Fictional calendar window" } }); companies.push(company.id)
    return prisma.communicationChannel.create({ data: { companyId: company.id, provider, emailAddress: "calendar@example.test", status: "ACTIVE", mailEnabled: false,
      credentialsEncrypted: encrypt(JSON.stringify(credentials())), config: { mode: "OAUTH", mailSyncGeneration: "original-connection" },
    } })
  }
  it.each(["GOOGLE", "MICROSOFT"])("advances the %s view so a previously out-of-window unchanged event becomes visible", async value => {
    const channel = await fixture(value)
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(true)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(1)
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z"))
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(true)
    const rows = await prisma.organisationTask.findMany({ where: { companyId: channel.companyId }, orderBy: { scheduledDate: "asc" } })
    expect(rows.map(row => row.scheduledDate?.toISOString())).toEqual(events.map(date => new Date(date).toISOString()))
    expect(rows).toHaveLength(2)
  })
  it.each(["GOOGLE", "MICROSOFT"])("retains the %s checkpoint window rather than inventing current dates for an old token", async value => {
    const channel = await fixture(value)
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    const saved = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    const stored = JSON.parse(decrypt(saved.credentialsEncrypted!)) as { calendarWindow?: { start: string; end: string } }
    expect(stored.calendarWindow).toBeDefined()
    expect(Date.parse(stored.calendarWindow!.start)).toBeLessThan(Date.now())
    expect(Date.parse(stored.calendarWindow!.end)).toBeGreaterThan(Date.parse("2027-01-15T12:00:00Z"))
    expect(saved.config).not.toHaveProperty("calendarSync.continuation")
  })
  it.each(["GOOGLE", "MICROSOFT"])("refuses a %s response after the mailbox reconnects, without importing into the new connection", async value => {
    const channel = await fixture(value), next = encrypt(JSON.stringify(credentials("new-fictional-access-token")))
    onRead = async () => { await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: next, config: { mode: "OAUTH", mailSyncGeneration: "new-connection" } } }) }
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow(/connexion a changé/i)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(0)
    const saved = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    expect(saved.credentialsEncrypted).toBe(next)
    expect(saved.config).toEqual({ mode: "OAUTH", mailSyncGeneration: "new-connection" })
  })
  it.each(["GOOGLE", "MICROSOFT"])("keeps the %s window stable for ordinary incremental jobs", async value => {
    const channel = await fixture(value)
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    const first = JSON.parse(decrypt((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted!))
    vi.setSystemTime(new Date("2026-01-16T12:00:00Z"))
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    const saved = JSON.parse(decrypt((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted!))
    expect(saved.calendarWindow).toEqual(first.calendarWindow)
    const url = new URL(String(vi.mocked(fetch).mock.calls.at(-1)![0]))
    expect(url.searchParams.has(value === "GOOGLE" ? "syncToken" : "$deltatoken")).toBe(true)
    expect(url.searchParams.has(value === "GOOGLE" ? "timeMin" : "startDateTime")).toBe(false)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(1)
  })
  it.each([403, 429, 503].flatMap(status => ["GOOGLE", "MICROSOFT"].map(value => [value, status] as const)))("retains the %s checkpoint and copies on HTTP %s", async (value, status) => {
    const channel = await fixture(value)
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    const before = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    const tasks = await prisma.organisationTask.findMany({ where: { companyId: channel.companyId } })
    failureStatus = status
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow()
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted).toBe(before.credentialsEncrypted)
    expect(await prisma.organisationTask.findMany({ where: { companyId: channel.companyId } })).toEqual(tasks)
  })
  it.each(["GOOGLE", "MICROSOFT"])("rebuilds an old %s token whose original window is unknown", async value => {
    const channel = await fixture(value)
    await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: encrypt(JSON.stringify({ ...credentials(), calendarCursor: "unknown-legacy-window" })) } })
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(true)
    const url = new URL(String(vi.mocked(fetch).mock.calls[0][0]))
    expect(url.searchParams.has(value === "GOOGLE" ? "syncToken" : "$deltatoken")).toBe(false)
    expect(url.searchParams.has(value === "GOOGLE" ? "timeMin" : "startDateTime")).toBe(true)
  })
  it.each(["GOOGLE", "MICROSOFT"])("refuses %s credentials if reconnection finishes before the first request", async value => {
    const channel = await fixture(value), original = emailProvider.validOAuthCredentials
    const next = encrypt(JSON.stringify(credentials("new-fictional-access-token")))
    vi.spyOn(emailProvider, "validOAuthCredentials").mockImplementationOnce(async selected => {
      const old = await original(selected)
      await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: next, config: { mode: "OAUTH", mailSyncGeneration: "new-connection" } } })
      return old
    })
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow(/connexion a changé/i)
    expect(fetch).not.toHaveBeenCalled()
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted).toBe(next)
  })
  it.each(["GOOGLE", "MICROSOFT"])("rejects a reconnect interleaved immediately before the %s checkpoint statement", async value => {
    const channel = await fixture(value), original = prisma.communicationChannel.updateMany.bind(prisma.communicationChannel)
    const next = encrypt(JSON.stringify(credentials("new-fictional-access-token")))
    let interleaved = false
    vi.spyOn(prisma.communicationChannel, "updateMany").mockImplementation(input => {
      const run = async () => {
        if (!interleaved && input.data.credentialsEncrypted) {
          interleaved = true
          await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: next, config: { mode: "OAUTH", mailSyncGeneration: "new-connection" } } })
        }
        return original(input)
      }
      return run() as ReturnType<typeof original>
    })
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow(/connexion a changé/i)
    expect(interleaved).toBe(true)
    const saved = await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })
    expect(saved.credentialsEncrypted).toBe(next)
    expect(saved.config).toEqual({ mode: "OAUTH", mailSyncGeneration: "new-connection" })
    // This copy committed before the reconnect; it remains historical.
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(1)
  })
  it("preserves a newer window when rotating the same connection's token", async () => {
    const channel = await fixture("GOOGLE")
    await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: encrypt(JSON.stringify({ ...credentials(), expiresAt: "2026-01-01T00:00:00Z" })) } })
    vi.stubEnv("GOOGLE_CLIENT_ID", "fictional-client"); vi.stubEnv("GOOGLE_CLIENT_SECRET", "fictional-secret")
    const window = { start: "2025-12-01T00:00:00Z", end: "2027-04-01T00:00:00Z" }
    vi.stubGlobal("fetch", vi.fn(async (_input, init: RequestInit) => {
      expect(init.method).toBe("POST")
      await emailProvider.storeOAuthCalendarCursor(channel, "concurrent-calendar-token", { generation: "original-connection", window })
      return Response.json({ access_token: "rotated-fictional-access", refresh_token: "rotated-fictional-refresh", expires_in: 3600 })
    }))
    expect(await emailProvider.validOAuthCredentials(channel)).toMatchObject({ accessToken: "rotated-fictional-access", refreshToken: "rotated-fictional-refresh", calendarCursor: "concurrent-calendar-token", calendarWindow: window })
  })
  it("refuses a Microsoft continuation to another resource", async () => {
    const channel = await fixture("MICROSOFT")
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ value: [], "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/contacts?$skiptoken=fictional" })))
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow("Curseur de calendrier")
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it.each(["GOOGLE", "MICROSOFT"])("resets an expired %s cursor without removing its historical copies", async value => {
    const channel = await fixture(value)
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    failureStatus = 410
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(false)
    const reset = JSON.parse(decrypt((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted!))
    expect(reset.calendarCursor).toBeUndefined(); expect(reset.calendarWindow).toBeUndefined()
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(1)
    failureStatus = 0
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(true)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(1)
  })
  it.each(["GOOGLE", "MICROSOFT"])("refuses %s page writes if reconnect wins between response validation and the SQL transaction", async value => {
    const channel = await fixture(value)
    const next = encrypt(JSON.stringify(credentials("new-fictional-access-token")))
    coordination.beforeTransaction = async () => {
      await prisma.communicationChannel.update({ where: { id: channel.id }, data: { credentialsEncrypted: next, config: { mode: "OAUTH", mailSyncGeneration: "new-connection" } } })
    }
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow(/connexion a changé/i)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(0)
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).credentialsEncrypted).toBe(next)
  })
  it("finishes an interrupted eleven-page Microsoft window before preparing the next month", async () => {
    const channel = await fixture("MICROSOFT"), calls: URL[] = []
    let fail = true
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = new URL(String(input)); calls.push(url)
      const page = Number(url.searchParams.get("page") || 0)
      if (page === 2 && fail) return Response.json({}, { status: 503 })
      const next = new URL(url); next.searchParams.set("page", String(page + 1))
      return Response.json({ value: [{ id: `fictional-page-${page}`, subject: "Fictional paged event", start: { dateTime: events[0], timeZone: "UTC" }, end: { dateTime: "2027-01-10T11:00:00Z", timeZone: "UTC" } }],
        ...(page < 10 ? { "@odata.nextLink": next.toString() } : { "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=eleven-page-window" }) })
    }))
    await expect(syncOAuthCalendarChannel(channel.companyId, channel.id)).rejects.toThrow()
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(2)
    const initialEnd = calls[0].searchParams.get("endDateTime")!
    vi.setSystemTime(new Date("2026-03-15T12:00:00Z")); fail = false
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    expect((await syncOAuthCalendarChannel(channel.companyId, channel.id)).complete).toBe(false)
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(11)
    expect(calls.filter(url => !url.searchParams.has("page"))).toHaveLength(1)
    expect(calls.filter(url => url.searchParams.get("page") === "2")).toHaveLength(2)
    expect(calls.every(url => url.searchParams.get("endDateTime") === initialEnd)).toBe(true)
    const previous = calls.length
    await syncOAuthCalendarChannel(channel.companyId, channel.id)
    expect(calls[previous].searchParams.has("$deltatoken")).toBe(false)
    expect(Date.parse(calls[previous].searchParams.get("endDateTime")!)).toBeGreaterThan(Date.parse(initialEnd))
  })
  it.each(["GOOGLE", "MICROSOFT"])("imports a complete fifty-event %s page with the requested page budget", async value => {
    const channel = await fixture(value)
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init: RequestInit) => {
      if (value === "GOOGLE") expect(new URL(String(input)).searchParams.get("maxResults")).toBe("50")
      else expect(new Headers(init.headers).get("prefer")).toContain("odata.maxpagesize=50")
      const items = Array.from({ length: 50 }, (_, index) => value === "GOOGLE"
        ? { id: `fixture-${index}`, summary: "Fictional bounded page", start: { dateTime: events[0] }, end: { dateTime: "2027-01-10T11:00:00Z" } }
        : { id: `fixture-${index}`, subject: "Fictional bounded page", start: { dateTime: events[0], timeZone: "UTC" }, end: { dateTime: "2027-01-10T11:00:00Z", timeZone: "UTC" } })
      return Response.json(value === "GOOGLE" ? { items, nextSyncToken: "complete-fifty" } : { value: items, "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=complete-fifty" })
    }))
    expect(await syncOAuthCalendarChannel(channel.companyId, channel.id)).toMatchObject({ examined: 50, imported: 50, complete: true })
    expect(await prisma.organisationTask.count({ where: { companyId: channel.companyId } })).toBe(50)
  })
})
