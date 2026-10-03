import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ events: vi.fn(), sequences: vi.fn(), periodic: vi.fn(), close: vi.fn() }))
vi.mock("@/lib/automations/engine", () => ({ processAutomationEvents: mocks.events }))
vi.mock("@/lib/automations/sequences", () => ({ processDueSequenceEmails: mocks.sequences }))
vi.mock("@/lib/bullmq/worker", () => ({ docGenWorker: { close: mocks.close } }))
vi.mock("@/lib/processing/periodic", () => ({ periodicProcessor: mocks.periodic }))
vi.mock("@/lib/demo-configuration", () => ({ publicDemoConfigurationIssues: () => [] }))
vi.mock("@/lib/scheduling/business", () => ({ processScheduledBusinessJobs: vi.fn() }))
vi.mock("@/lib/communications/communication-sync", () => ({ syncDueOAuthCommunicationChannels: vi.fn() }))

import { processAutomationBatch } from "@/lib/automations/process"
import { POST } from "@/app/api/automations/process/route"

describe("automation processor entry points", () => {
  beforeEach(() => {
    mocks.events.mockReset().mockResolvedValue({ examined: 0, completed: 0 })
    mocks.sequences.mockReset().mockResolvedValue({ examined: 0, sent: 0, failed: 0 })
    mocks.periodic.mockReset().mockReturnValue({ run: vi.fn(), stop: vi.fn() })
  })

  it("waits for outbox processing before starting sequence writes", async () => {
    let release!: () => void
    mocks.events.mockImplementation(() => new Promise(resolve => { release = () => resolve({ examined: 41, completed: 41 }) }))
    const batch = processAutomationBatch()
    expect(mocks.events).toHaveBeenCalledWith(50)
    expect(mocks.sequences).not.toHaveBeenCalled()
    release()
    expect(await batch).toEqual([
      { status: "fulfilled", value: { examined: 41, completed: 41 } },
      { status: "fulfilled", value: { examined: 0, sent: 0, failed: 0 } },
    ])
    expect(mocks.sequences).toHaveBeenCalledWith(100)
  })

  it("continues sequences after an outbox failure and reports both failures", async () => {
    const eventError = new Error("outbox unavailable"), sequenceError = new Error("sequence unavailable")
    mocks.events.mockRejectedValue(eventError)
    mocks.sequences.mockRejectedValue(sequenceError)
    expect(await processAutomationBatch()).toEqual([
      { status: "rejected", reason: eventError }, { status: "rejected", reason: sequenceError },
    ])
    expect(mocks.sequences).toHaveBeenCalledTimes(1)
  })

  it("preserves cron authorization and exposes partial failure as HTTP 503", async () => {
    vi.stubEnv("AUTOMATION_CRON_SECRET", "isolated-processor-test-secret")
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    try {
      expect((await POST(new Request("https://example.test/api/automations/process"))).status).toBe(401)
      expect(mocks.events).not.toHaveBeenCalled()
      mocks.events.mockRejectedValue(new Error("outbox unavailable"))
      const response = await POST(new Request("https://example.test/api/automations/process", { headers: { authorization: "Bearer isolated-processor-test-secret" } }))
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({ success: false, scenarios: { error: "Traitement indisponible" }, summary: { examined: 0, sent: 0, failed: 0 } })
      expect(mocks.sequences).toHaveBeenCalledTimes(1)
    } finally {
      log.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it("starts outbox processing from the permanent worker's periodic automation task", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "editable")
    vi.stubEnv("NEXT_PUBLIC_DEMO_READ_ONLY", "false")
    const on = vi.spyOn(process, "on").mockReturnValue(process)
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined)
    try {
      await import("@/worker")
      expect(mocks.periodic.mock.calls[0][1]).toBe(60_000)
      await mocks.periodic.mock.calls[0][0]()
      expect(mocks.events).toHaveBeenCalledWith(50)
      expect(mocks.sequences).toHaveBeenCalledWith(100)
    } finally {
      on.mockRestore()
      log.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
