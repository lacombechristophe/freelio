import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const cursors = vi.hoisted(() => new Map<string, string | null>())
vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", async () => {
  const { default: db } = await import("@/lib/prisma")
  return {
    activeCommunicationChannel: (companyId: string, id: string) => db.communicationChannel.findFirstOrThrow({ where: { companyId, id, status: "ACTIVE" } }),
    validOAuthAccessToken: async () => "fictitious-token",
    validOAuthCredentials: async (channel: { id: string }) => ({ accessToken: "fictitious-token", scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.modify Mail.ReadWrite", calendarCursor: cursors.get(channel.id) }),
    storeOAuthCalendarCursor: async (channel: { id: string }, cursor: string | null) => { cursors.set(channel.id, cursor) },
  }
})

import prisma from "@/lib/prisma"
import { syncOAuthEmailChannel } from "@/lib/communications/email-sync"
import { syncOAuthCalendarChannel } from "@/lib/communications/calendar-sync"
import { syncOAuthCommunicationChannel } from "@/lib/communications/communication-sync"

describe.sequential("bounded and resumable provider pagination on SQL", () => {
  const companyIds: string[] = []
  beforeEach(() => { vi.unstubAllGlobals(); cursors.clear() })
  afterAll(async () => {
    vi.unstubAllGlobals()
    for (const id of companyIds) await prisma.company.delete({ where: { id } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "email-sync:" } } })
    await prisma.processorLease.deleteMany({ where: { name: { startsWith: "calendar-sync:" } } })
  })

  async function fixture(provider: string) {
    const company = await prisma.company.create({ data: { name: "Fictitious pagination fixture" } })
    companyIds.push(company.id)
    const channel = await prisma.communicationChannel.create({ data: { companyId: company.id, provider, emailAddress: "mailbox@example.test", status: "ACTIVE" } })
    return { company, channel }
  }

  it.each(["GOOGLE", "MICROSOFT"])("imports all 151 messages per folder for %s without advancing an incomplete watermark", async (provider) => {
    const { company, channel } = await fixture(provider)
    const occurredAt = new Date(Date.now() - 10 * 86_400_000).toISOString()
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input))
      if (provider === "GOOGLE" && /\/messages\/[^/]+$/.test(url.pathname)) {
        const id = url.pathname.split("/").at(-1)!
        return Response.json({ id, internalDate: String(new Date(occurredAt).getTime()), labelIds: ["UNREAD"], payload: { mimeType: "text/plain", body: { data: Buffer.from("Fictitious message").toString("base64url") }, headers: [{ name: "From", value: `${id}@example.test` }, { name: "Subject", value: id }] } })
      }
      const folder = provider === "GOOGLE" ? url.searchParams.get("labelIds")! : url.pathname.includes("sentitems") ? "SENT" : "INBOX"
      const page = Number(url.searchParams.get(provider === "GOOGLE" ? "pageToken" : "page") || 0)
      const ids = Array.from({ length: Math.min(50, 151 - page * 50) }, (_, i) => `${folder}-${page * 50 + i}`)
      const next = ids.length === 50 ? page + 1 : null
      if (provider === "GOOGLE") return Response.json({ messages: ids.map((id) => ({ id })), ...(next === null ? {} : { nextPageToken: String(next) }) })
      const continuation = new URL(url); continuation.searchParams.set("page", String(next))
      return Response.json({ value: ids.map((id) => ({ id, subject: id, from: { emailAddress: { address: `${id}@example.test` } }, body: { contentType: "text", content: "Fixture" }, receivedDateTime: occurredAt, sentDateTime: occurredAt, isRead: false })), ...(next === null ? {} : { "@odata.nextLink": continuation.toString() }) })
    }))
    const first = await syncOAuthEmailChannel(company.id, channel.id)
    expect(first.complete).toBe(false)
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).lastSyncAt).toBeNull()
    const second = await syncOAuthEmailChannel(company.id, channel.id)
    expect(second.complete).toBe(true)
    expect(first.imported + second.imported).toBe(302)
    expect(await prisma.emailMessage.count({ where: { companyId: company.id } })).toBe(302)
    await syncOAuthEmailChannel(company.id, channel.id)
    await syncOAuthEmailChannel(company.id, channel.id)
    expect(await prisma.emailMessage.count({ where: { companyId: company.id } })).toBe(302)
  }, 60_000)

  it("resumes an eleven-page calendar after page three fails, without re-reading completed pages", async () => {
    const { company, channel } = await fixture("GOOGLE")
    let fail = true
    const pages: number[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const url = new URL(String(input)); const page = Number(url.searchParams.get("pageToken") || 0)
      pages.push(page)
      if (page === 2 && fail) return Response.json({ error: { message: "Simulated outage" } }, { status: 503 })
      return Response.json({ items: [{ id: `event-${page}`, summary: "Fictitious appointment", start: { dateTime: "2026-10-15T10:00:00Z" }, end: { dateTime: "2026-10-15T11:00:00Z" } }], ...(page < 10 ? { nextPageToken: String(page + 1) } : { nextSyncToken: "final-calendar-checkpoint" }) })
    }))
    await expect(syncOAuthCalendarChannel(company.id, channel.id)).rejects.toThrow("Simulated outage")
    expect(await prisma.organisationTask.count({ where: { companyId: company.id } })).toBe(2)
    expect(cursors.get(channel.id)).toBeUndefined()
    fail = false
    const first = await syncOAuthCalendarChannel(company.id, channel.id)
    expect(first.complete).toBe(false)
    expect(cursors.get(channel.id)).toBeUndefined()
    await syncOAuthCalendarChannel(company.id, channel.id)
    const last = await syncOAuthCalendarChannel(company.id, channel.id)
    expect(last.complete).toBe(true)
    expect(await prisma.organisationTask.count({ where: { companyId: company.id } })).toBe(11)
    expect(cursors.get(channel.id)).toBe("final-calendar-checkpoint")
    expect(pages.filter((page) => page === 0)).toHaveLength(1)
    expect(pages.filter((page) => page === 2)).toHaveLength(2)
  })

  it("attempts the calendar even when mail fails and preserves separate capability states", async () => {
    const { company, channel } = await fixture("GOOGLE")
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => String(input).includes("/gmail/") ? Response.json({ error: { message: "Mail unavailable" } }, { status: 503 }) : Response.json({ items: [], nextSyncToken: "calendar-only-success" })))
    const result = await syncOAuthCommunicationChannel(company.id, channel.id)
    expect(result.email.status).toBe("FAILED")
    expect(result.calendar.status).toBe("SYNCED")
    expect(cursors.get(channel.id)).toBe("calendar-only-success")
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: channel.id } })).lastError).toContain("Mail unavailable")
  })

  it("makes no provider call for disabled capabilities and reports them honestly", async () => {
    const { company, channel } = await fixture("GOOGLE")
    await prisma.communicationChannel.update({ where: { id: channel.id }, data: { mailEnabled: false, calendarEnabled: false } })
    const fetchMock = vi.fn(() => { throw new Error("Disabled capability contacted a provider") })
    vi.stubGlobal("fetch", fetchMock)
    const result = await syncOAuthCommunicationChannel(company.id, channel.id)
    expect(result.email.status).toBe("DISABLED")
    expect(result.calendar.status).toBe("DISABLED")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
