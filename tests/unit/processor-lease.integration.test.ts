import { afterAll, describe, expect, it } from "vitest"

import prisma from "@/lib/prisma"
import { withProcessorLease } from "@/lib/processing/lease"

describe.sequential("processor lease", () => {
  const leaseName = `test-processor-${Date.now()}-${Math.random().toString(36).slice(2)}`

  afterAll(async () => {
    await prisma.processorLease.deleteMany({ where: { name: leaseName } })
  })

  it("prevents overlapping work and keeps a successful heartbeat", async () => {
    let releaseTask!: () => void
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => { started = resolve })
    const gate = new Promise<void>((resolve) => { releaseTask = resolve })
    const first = withProcessorLease(leaseName, async () => {
      started()
      await gate
      return "done"
    })
    await startedPromise

    await expect(withProcessorLease(leaseName, async () => "overlap")).resolves.toEqual({ acquired: false })
    releaseTask()
    await expect(first).resolves.toEqual({ acquired: true, value: "done" })

    const heartbeat = await prisma.processorLease.findUniqueOrThrow({ where: { name: leaseName } })
    expect(heartbeat.lastSucceededAt).toBeInstanceOf(Date)
    expect(heartbeat.lastError).toBeNull()
  })

  it("releases the lease and records a bounded error after a failed task", async () => {
    await expect(withProcessorLease(leaseName, async () => {
      throw new Error("temporary provider failure")
    })).rejects.toThrow("temporary provider failure")

    const heartbeat = await prisma.processorLease.findUniqueOrThrow({ where: { name: leaseName } })
    expect(heartbeat.lastFailedAt).toBeInstanceOf(Date)
    expect(heartbeat.lastError).toBe("temporary provider failure")
    expect(heartbeat.leaseUntil.getTime()).toBeLessThanOrEqual(Date.now())

    await expect(withProcessorLease(leaseName, async () => "recovered")).resolves.toEqual({ acquired: true, value: "recovered" })
  })
})
