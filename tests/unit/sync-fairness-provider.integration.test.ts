import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/crypto"
import { syncDueOAuthCommunicationChannels } from "@/lib/communications/communication-sync"

const companies: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  for (const id of companies.splice(0)) await prisma.company.delete({ where: { id } })
})
describe("calendar-only scheduling with real workers and isolated provider HTTP", () => {
  it.each([false, true])("reaches all Google/Graph connections despite earlier failures: %s", async failing => {
    const company = await prisma.company.create({ data: { name: "Fictional provider scheduling" } }); companies.push(company.id)
    const tokens = new Map<string, string>(), seen: string[] = [], failedTokens = new Set<string>()
    for (let i = 0; i < 6; i++) {
      const provider = i % 2 ? "MICROSOFT" : "GOOGLE", token = `fictional-access-token-${i}`
      const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider, emailAddress: `fake-${i}@example.test`, status: "ACTIVE", mailEnabled: false, calendarEnabled: true,
        credentialsEncrypted: encrypt(JSON.stringify({ mode: "OAUTH", accessToken: token, refreshToken: "fictional-refresh-token-only", scope: provider === "GOOGLE" ? "https://www.googleapis.com/auth/calendar.events" : "Calendars.ReadWrite", expiresAt: "2099-01-01T00:00:00.000Z" })) } })
      tokens.set(channel.id, `Bearer ${token}`)
      if (failing && i < 2) failedTokens.add(`Bearer ${token}`)
    }
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(init?.method || "GET").toBe("GET")
      const url = new URL(String(input)), token = new Headers(init?.headers).get("authorization")!
      expect([...tokens.values()]).toContain(token); seen.push(token)
      if (failedTokens.has(token)) return Response.json({ error: { message: "Fictional provider unavailable" } }, { status: 503 })
      if (url.hostname === "www.googleapis.com" && url.pathname.endsWith("/events")) return Response.json({ items: [], nextSyncToken: "fictional-calendar-cursor" })
      if (url.hostname === "graph.microsoft.com" && url.pathname.endsWith("/calendarView/delta")) return Response.json({ value: [], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/calendarView/delta?$deltatoken=fictional" })
      throw new Error("Unexpected isolated calendar URL")
    }))
    const summaries = []
    for (let batch = 0; batch < 3; batch++) summaries.push(await syncDueOAuthCommunicationChannels(2))
    expect(seen).toHaveLength(6); expect(new Set(seen)).toEqual(new Set(tokens.values()))
    expect(summaries.reduce((total, result) => total + result.synced, 0)).toBe(failing ? 4 : 6)
    expect(summaries.reduce((total, result) => total + result.failed, 0)).toBe(failing ? 2 : 0)
    const rows = await prisma.communicationChannel.findMany({ where: { companyId: company.id } })
    expect(rows.every(row => row.syncAttemptCursor !== null && row.lastSyncAt === null)).toBe(true)
    for (const row of rows) expect(row.config).toMatchObject({ calendarSyncStatus: { status: failedTokens.has(tokens.get(row.id)!) ? "FAILED" : "SYNCED" } })
  })
})
