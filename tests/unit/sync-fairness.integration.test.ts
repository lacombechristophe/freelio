import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ seen: [] as string[], failing: new Set<string>(), calendarOnly: true, partial: false,
  afterSelection: null as (() => Promise<void>) | null, onCalendar: null as (() => Promise<void>) | null }))
vi.mock("@/lib/prisma", async original => {
  const actual = await original<typeof import("@/lib/prisma")>(), real = actual.default
  return { ...actual, default: new Proxy(real, { get(target, key) {
    if (key !== "communicationChannel") return Reflect.get(target, key)
    return new Proxy(real.communicationChannel, { get(delegate, method) {
      if (method !== "findMany") return Reflect.get(delegate, method)
      return async (...args: Parameters<typeof real.communicationChannel.findMany>) => {
        const rows = await real.communicationChannel.findMany(...args)
        if (args[0]?.select?.syncAttemptCursor) { const hook = state.afterSelection; state.afterSelection = null; await hook?.() }
        return rows
      }
    } })
  } }) }
})
vi.mock("@/lib/communications/email-sync", () => ({ syncOAuthEmailChannel: vi.fn(async (_company: string, id: string) => {
  if (state.failing.has(id)) throw new Error("Fictional unavailable mailbox")
  return { examined: 0, imported: 0, complete: true, disabled: state.calendarOnly }
}) }))
vi.mock("@/lib/communications/calendar-sync", () => ({ CalendarReconnectRequiredError: class extends Error {}, syncOAuthCalendarChannel: vi.fn(async (_company: string, id: string) => {
  state.seen.push(id); await state.onCalendar?.(); return { examined: 0, imported: 0, complete: !state.partial }
}) }))
import prisma from "@/lib/prisma"
import { syncDueOAuthCommunicationChannels } from "@/lib/communications/communication-sync"
const companies: string[] = []
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks(); state.afterSelection = null; state.onCalendar = null; state.partial = false
  for (const id of companies.splice(0)) await prisma.company.delete({ where: { id } })
  state.seen.length = 0; state.failing.clear()
})
describe("communication scheduling fairness on real SQL", () => {
  async function fixture(count = 6) {
    const company = await prisma.company.create({ data: { name: "Fictional scheduling rotation" } }); companies.push(company.id)
    for (let i = 0; i < count; i++) await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: `fake-${i}@example.test`, status: "ACTIVE", mailEnabled: false, calendarEnabled: true } })
    return prisma.communicationChannel.findMany({ where: { companyId: company.id }, orderBy: { id: "asc" } })
  }
  it.each([false, true])("eventually examines every active channel with a two-channel batch (first channels failing: %s)", async failing => {
    state.calendarOnly = !failing; const company = await prisma.company.create({ data: { name: "Fictional calendar scheduling" } }); companies.push(company.id)
    for (let index = 0; index < 6; index++) await prisma.communicationChannel.create({ data: { companyId: company.id, provider: "GOOGLE", emailAddress: `fiction-${index}@example.test`, status: "ACTIVE", mailEnabled: failing, calendarEnabled: true } })
    const channels = await prisma.communicationChannel.findMany({ where: { companyId: company.id }, orderBy: { lastSyncAt: "asc" } })
    if (failing) channels.slice(0, 2).forEach(channel => state.failing.add(channel.id))
    for (let batch = 0; batch < 3; batch++) await syncDueOAuthCommunicationChannels(2)
    expect(new Set(state.seen).size).toBe(6)
  })
  it("continues rotating under a frozen clock, after clock rollback and with partial results", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-20T12:00:00Z"))
    const rows = await fixture(); state.calendarOnly = true; state.partial = true
    const success = new Date("2026-01-01T12:00:00Z")
    await prisma.communicationChannel.updateMany({ where: { companyId: rows[0].companyId }, data: { lastSyncAt: success } })
    for (let batch = 0; batch < 9; batch++) {
      if (batch === 3) vi.setSystemTime(new Date("2025-01-01T12:00:00Z"))
      expect(await syncDueOAuthCommunicationChannels(2)).toMatchObject({ examined: 2, synced: 0, failed: 0 })
    }
    for (const row of rows) expect(state.seen.filter(id => id === row.id)).toHaveLength(3)
    const saved = await prisma.communicationChannel.findMany({ where: { companyId: rows[0].companyId } })
    expect(saved.every(row => row.lastSyncAt?.getTime() === success.getTime() && row.syncAttemptCursor !== null)).toBe(true)
  })
  it("rotates across companies and skips inactive, non-OAuth or disabled connections", async () => {
    const a = await fixture(4), b = await fixture(2); state.calendarOnly = true
    const disabled = await prisma.communicationChannel.create({ data: { companyId: a[0].companyId, provider: "GOOGLE", emailAddress: "disabled@example.test", status: "ACTIVE", mailEnabled: false, calendarEnabled: false } })
    await prisma.communicationChannel.create({ data: { companyId: a[0].companyId, provider: "RESEND", emailAddress: "resend@example.test", status: "ACTIVE" } })
    await prisma.communicationChannel.create({ data: { companyId: a[0].companyId, provider: "MICROSOFT", emailAddress: "inactive@example.test", status: "INACTIVE" } })
    for (let i = 0; i < 3; i++) await syncDueOAuthCommunicationChannels(2)
    expect(new Set(state.seen)).toEqual(new Set([...a, ...b].map(row => row.id)))
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: disabled.id } })).syncAttemptCursor).toBeNull()
  })
  it("rechecks a disconnect between selection and claim without advancing its cursor", async () => {
    const rows = await fixture(2); state.calendarOnly = true
    state.afterSelection = async () => { await prisma.communicationChannel.update({ where: { id: rows[0].id }, data: { status: "INACTIVE" } }) }
    expect(await syncDueOAuthCommunicationChannels(2)).toMatchObject({ examined: 1, synced: 1 })
    expect(state.seen).toEqual([rows[1].id])
    expect((await prisma.communicationChannel.findUniqueOrThrow({ where: { id: rows[0].id } })).syncAttemptCursor).toBeNull()
  })
  it("does not run a stale selection already claimed by another scheduler", async () => {
    const rows = await fixture(2); state.calendarOnly = true
    state.afterSelection = async () => { expect(await syncDueOAuthCommunicationChannels(1)).toMatchObject({ examined: 1 }) }
    expect(await syncDueOAuthCommunicationChannels(2)).toMatchObject({ examined: 1 })
    expect(state.seen).toEqual(rows.map(row => row.id))
  })
  it("retains the first attempt on lease loss and lets later work progress", async () => {
    const rows = await fixture(3); state.calendarOnly = true
    let lost = false
    const control = { signal: new AbortController().signal, assertOwned: async () => { if (lost) throw new Error("PROCESSOR_LEASE_LOST") } }
    state.onCalendar = async () => { lost = true }
    await expect(syncDueOAuthCommunicationChannels(3, control)).rejects.toThrow("PROCESSOR_LEASE_LOST")
    expect(state.seen).toEqual([rows[0].id])
    state.onCalendar = null
    expect(await syncDueOAuthCommunicationChannels(2)).toMatchObject({ examined: 2 })
    expect(new Set(state.seen).size).toBe(3)
  })
  it("stops starting channels after the job budget and resumes untouched rows next time", async () => {
    const rows = await fixture(3); state.calendarOnly = true
    let elapsed = 0
    vi.spyOn(performance, "now").mockImplementation(() => elapsed)
    state.onCalendar = async () => { elapsed = 180_000 }
    expect(await syncDueOAuthCommunicationChannels(3)).toMatchObject({ examined: 1, synced: 1 })
    expect(state.seen).toEqual([rows[0].id])
    state.onCalendar = null
    expect(await syncDueOAuthCommunicationChannels(2)).toMatchObject({ examined: 2 })
    expect(new Set(state.seen).size).toBe(3)
  })
  it("keeps each job within the 25-channel maximum", async () => {
    await fixture(26); state.calendarOnly = true
    expect(await syncDueOAuthCommunicationChannels(1000)).toMatchObject({ examined: 25, synced: 25 })
    expect(new Set(state.seen).size).toBe(25)
    expect(await syncDueOAuthCommunicationChannels(1)).toMatchObject({ examined: 1 })
    expect(new Set(state.seen).size).toBe(26)
  })
})
