import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"

import prisma, { type TransactionClient } from "@/lib/prisma"

const DEFAULT_LEASE_MS = 15 * 60_000

export type ProcessorLeaseResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

export type ProcessorLeaseControl = { assertOwned: (tx?: TransactionClient) => Promise<void>; signal: AbortSignal }

function uniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export async function withProcessorLease<T>(
  name: string,
  task: (control: ProcessorLeaseControl) => Promise<T>,
  leaseMs = DEFAULT_LEASE_MS,
): Promise<ProcessorLeaseResult<T>> {
  const ownerId = randomUUID()
  const now = new Date()
  const leaseUntil = new Date(now.getTime() + Math.max(30_000, leaseMs))
  let acquired = false

  try {
    await prisma.processorLease.create({ data: { name, ownerId, leaseUntil, lastStartedAt: now } })
    acquired = true
  } catch (error) {
    if (!uniqueConstraint(error)) throw error
    const claim = await prisma.processorLease.updateMany({
      where: { name, leaseUntil: { lte: now } },
      data: { ownerId, leaseUntil, lastStartedAt: now, lastError: null },
    })
    acquired = claim.count === 1
  }

  if (!acquired) return { acquired: false }

  const controller = new AbortController()
  let renewing: Promise<void> | undefined
  let lost: Error | undefined
  const assertOwned = async (tx?: TransactionClient) => {
    if (lost) throw lost
    const owned = await (tx || prisma).processorLease.count({ where: { name, ownerId, leaseUntil: { gt: new Date() } } })
    if (owned !== 1) {
      lost = new Error("PROCESSOR_LEASE_LOST")
      controller.abort(lost)
      throw lost
    }
  }
  const renewal = setInterval(() => {
    if (renewing || lost) return
    renewing = (async () => {
      const now = new Date()
      const updated = await prisma.processorLease.updateMany({ where: { name, ownerId, leaseUntil: { gt: now } }, data: { leaseUntil: new Date(now.getTime() + Math.max(30_000, leaseMs)) } })
      if (updated.count !== 1) throw new Error("PROCESSOR_LEASE_LOST")
    })().catch(() => {
      lost = new Error("PROCESSOR_LEASE_LOST")
      controller.abort(lost)
    }).finally(() => { renewing = undefined })
  }, Math.max(1_000, Math.floor(Math.max(30_000, leaseMs) / 3)))
  renewal.unref()

  try {
    const value = await task({ assertOwned, signal: controller.signal })
    await assertOwned()
    await prisma.processorLease.updateMany({
      where: { name, ownerId },
      data: { lastSucceededAt: new Date(), lastError: null },
    })
    return { acquired: true, value }
  } catch (error) {
    await prisma.processorLease.updateMany({
      where: { name, ownerId },
      data: {
        lastFailedAt: new Date(),
        lastError: (error instanceof Error ? error.message : "Erreur inconnue").slice(0, 1_000),
      },
    }).catch(() => undefined)
    throw error
  } finally {
    clearInterval(renewal)
    if (renewing) await renewing
    await prisma.processorLease.updateMany({
      where: { name, ownerId },
      data: { leaseUntil: new Date() },
    }).catch((error) => {
      console.error("Processor lease release failed", {
        name,
        error: error instanceof Error ? error.message : "unknown error",
      })
    })
  }
}
