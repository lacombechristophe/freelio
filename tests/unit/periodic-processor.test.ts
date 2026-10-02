import { afterEach, describe, expect, it, vi } from "vitest"
import { periodicProcessor } from "@/lib/processing/periodic"

afterEach(() => vi.useRealTimers())

describe("periodic worker lifecycle", () => {
  it("drains active work, prevents overlaps and refuses new work after stop", async () => {
    vi.useFakeTimers()
    let release!: () => void
    const task = vi.fn(() => new Promise<void>(resolve => { release = resolve }))
    const processor = periodicProcessor(task, 100)
    const first = processor.run()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(500)
    expect(task).toHaveBeenCalledTimes(1)
    expect(processor.run()).toBe(first)
    let drained = false
    const stop = processor.stop().then(() => { drained = true })
    await Promise.resolve()
    expect(drained).toBe(false)
    release()
    await stop
    await processor.run()
    await vi.advanceTimersByTimeAsync(500)
    expect(task).toHaveBeenCalledTimes(1)
    expect(drained).toBe(true)
  })

  it("allows retry after a rejected run and still drains cleanly", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("temporary failure")).mockResolvedValue(undefined)
    const processor = periodicProcessor(task, 60_000)
    try {
      await expect(processor.run()).rejects.toThrow("temporary failure")
      await processor.run()
      expect(task).toHaveBeenCalledTimes(2)
    } finally {
      await processor.stop()
    }
  })
})
