import { randomUUID } from "node:crypto"
import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"

const DEFAULT_LEASE_MS = 15 * 60_000

export type ProcessorLeaseResult<T> =
  | { acquired: true; value: T }
  | { acquired: false }

function uniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export async function withProcessorLease<T>(
  name: string,
  task: () => Promise<T>,
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

  try {
    const value = await task()
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
