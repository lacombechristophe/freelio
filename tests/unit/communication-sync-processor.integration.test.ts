import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const sync = vi.hoisted(() => vi.fn())
vi.mock("@/lib/communications/communication-sync", () => ({ syncDueOAuthCommunicationChannels: sync }))
import { POST } from "@/app/api/communications/sync/process/route"
import { withProcessorLease } from "@/lib/processing/lease"

const summary = { examined: 2, synced: 2, messagesImported: 0, calendarEventsImported: 0, calendarReconnectRequired: 0, failed: 0 }
const request = () => new Request("https://example.test/api/communications/sync/process", { method: "POST", headers: { authorization: "Bearer isolated-sync-processor-secret-only" } })
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("COMMUNICATIONS_CRON_SECRET", "isolated-sync-processor-secret-only"); sync.mockResolvedValue(summary) })
afterEach(() => vi.unstubAllEnvs())
describe("communication processor HTTP status and real SQL lease", () => {
  it("rejects an unauthorized request before dispatch", async () => {
    expect((await POST(new Request("https://example.test/api/communications/sync/process", { method: "POST" }))).status).toBe(401)
    expect(sync).not.toHaveBeenCalled()
  })
  it("reports a completed successful batch and passes its lease control", async () => {
    sync.mockImplementationOnce(async (limit, control) => { expect(limit).toBe(10); expect(control.signal).toBeInstanceOf(AbortSignal); await control.assertOwned(); return summary })
    const response = await POST(request())
    expect(response.status).toBe(200); expect(await response.json()).toEqual(summary)
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
  it("exposes a partial failure to HTTP-only cron monitors without discarding the successful counts", async () => {
    sync.mockResolvedValueOnce({ ...summary, synced: 1, failed: 1 })
    const response = await POST(request())
    expect(await response.json()).toEqual({ ...summary, synced: 1, failed: 1 })
    expect(response.status).toBe(503)
  })
  it("reports an already running job without dispatching a second one", async () => {
    const result = await withProcessorLease("communication-sync", async () => {
      const response = await POST(request())
      expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ examined: 0, skipped: "PROCESSOR_BUSY" })
    })
    expect(result.acquired).toBe(true); expect(sync).not.toHaveBeenCalled()
  })
})
