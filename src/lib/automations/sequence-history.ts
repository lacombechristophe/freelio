import { z } from "zod"
import { Prisma } from "@prisma/client"
import { recordOutgoingEmail } from "@/lib/communications/threads"
import prisma from "@/lib/prisma"
import type { ProcessorLeaseControl } from "@/lib/processing/lease"

export const sequencePayloadSchema = z.object({
  kind: z.literal("SEQUENCE"), companyName: z.string(), replyTo: z.string().nullable(),
  to: z.string().email(), from: z.string(), subject: z.string(), html: z.string(), headers: z.record(z.string(), z.string()),
})

export async function ensureSequenceHistory(deliveryId: string, companyId: string) {
  const delivery = await prisma.emailDelivery.findFirstOrThrow({ where: { id: deliveryId, companyId }, include: { message: { select: { id: true } } } })
  if (delivery.message) return
  if (!delivery.provider || !delivery.providerId || !delivery.sentAt) throw new Error("Référence d’envoi absente ; réconciliation nécessaire")
  const payload = sequencePayloadSchema.parse(delivery.payload)
  await recordOutgoingEmail({ companyId, deliveryId, channelId: delivery.channelId, contactId: delivery.contactId, leadCaptureId: delivery.leadCaptureId,
    provider: delivery.provider, providerId: delivery.providerId, from: payload.from, to: [payload.to], subject: payload.subject, bodyHtml: payload.html, sentAt: delivery.sentAt })
}

/** Repair confirmed transport history independently of campaign/enrollment state. */
export async function repairSequenceHistories(control: ProcessorLeaseControl, limit: number, companyId?: string) {
  const pending = await prisma.emailDelivery.findMany({ where: { ...(companyId ? { companyId } : {}), sequenceId: { not: null },
    providerId: { not: null }, sentAt: { not: null }, message: { is: null }, payload: { not: Prisma.DbNull },
  // A failed repair updates updatedAt and yields its place to older pending
  // repairs, so a damaged historical row cannot starve the entire backlog.
  }, orderBy: [{ updatedAt: "asc" }, { id: "asc" }], take: limit, select: { id: true, companyId: true } })
  let repaired = 0
  for (const delivery of pending) {
    await control.assertOwned()
    try {
      await ensureSequenceHistory(delivery.id, delivery.companyId)
      await prisma.emailDelivery.updateMany({ where: { id: delivery.id, companyId: delivery.companyId }, data: { error: null } })
      repaired += 1
    } catch (error) {
      await prisma.emailDelivery.updateMany({ where: { id: delivery.id, companyId: delivery.companyId }, data: { error: `Historique à réparer : ${(error instanceof Error ? error.message : "SQL indisponible").slice(0, 400)}` } })
    }
  }
  return repaired
}
