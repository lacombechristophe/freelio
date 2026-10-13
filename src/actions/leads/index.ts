"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import type { Prisma } from "@prisma/client"

import { withAuth } from "@/lib/auth-wrapper"
import { enqueueAutomationEvent, dispatchAutomationEvent } from "@/lib/automations/engine"
import { createConsentWithdrawalToken } from "@/lib/leads/consent-token"
import prisma from "@/lib/prisma"
import { refreshSingleLeadIntelligence } from "@/lib/marketing/intelligence"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

const idSchema = z.string().cuid()
const leadStatusSchema = z.enum(["NEW", "CONTACTED", "QUALIFIED", "ARCHIVED", "SPAM"])

const inboxQuery = z.object({
  search: z.string().trim().max(200).default(""),
  status: z.enum(["ACTIVE", "ALL", "NEW", "CONTACTED", "QUALIFIED", "ARCHIVED", "SPAM"]).default("ACTIVE"),
  page: z.number().int().min(1).max(100000).default(1),
}).strict()

export async function getLeadDashboard(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = inboxQuery.parse(input)
    const fields = ["firstName", "lastName", "email", "phone", "city", "postalCode", "projectType", "source"] as const
    const where: Prisma.LeadCaptureWhereInput = {
      companyId,
      ...(query.status === "ACTIVE" ? { status: { notIn: ["ARCHIVED", "SPAM"] } } : query.status === "ALL" ? {} : { status: query.status }),
      ...(query.search ? { AND: query.search.split(/\s+/).map(word => ({ OR: fields.map(field => ({
        [field]: { contains: word, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) },
      })) })) } : {}),
    }
    const result = await prisma.$transaction(async tx => {
      const total = await tx.leadCapture.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const [leads, statuses, sources, optInCount] = await Promise.all([
        tx.leadCapture.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: DIRECTORY_PAGE_SIZE,
          skip: (page - 1) * DIRECTORY_PAGE_SIZE,
          include: {
            client: { select: { id: true, name: true, nextActionAt: true } },
            consents: { orderBy: { capturedAt: "desc" }, take: 4, select: { id: true, channel: true, purpose: true, status: true, capturedAt: true } },
          },
        }),
        tx.leadCapture.groupBy({ by: ["status"], where: { companyId }, _count: { _all: true } }),
        tx.leadCapture.groupBy({ by: ["source"], where: { companyId }, _count: { _all: true } }),
        tx.leadCapture.count({ where: { companyId, marketingOptIn: true } }),
      ])
      return { leads, statuses, sources, optInCount, total, page }
    }, { isolationLevel: "Serializable" })

    const counts = { NEW: 0, CONTACTED: 0, QUALIFIED: 0, ARCHIVED: 0, SPAM: 0 }
    for (const row of result.statuses) {
      if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all
    }

    return {
      counts,
      optInCount: result.optInCount,
      total: result.total,
      page: result.page,
      sources: result.sources.map(row => ({ source: row.source, count: row._count._all })).sort((a, b) => b.count - a.count || a.source.localeCompare(b.source)),
      leads: result.leads.map((lead) => ({
        id: lead.id,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        postalCode: lead.postalCode,
        city: lead.city,
        projectType: lead.projectType,
        message: lead.message,
        source: lead.source,
        utmSource: lead.utmSource,
        utmCampaign: lead.utmCampaign,
        marketingOptIn: lead.marketingOptIn,
        status: lead.status,
        score: lead.score,
        scoreBreakdown: lead.scoreBreakdown,
        scoreUpdatedAt: lead.scoreUpdatedAt?.toISOString() ?? null,
        createdAt: lead.createdAt.toISOString(),
        client: lead.client ? { ...lead.client, nextActionAt: lead.client.nextActionAt?.toISOString() ?? null } : null,
        consents: lead.consents.map((consent) => ({ ...consent, capturedAt: consent.capturedAt.toISOString() })),
      })),
    }
  }, "crm.read")
}

export async function updateLeadStatus(leadId: string, status: string) {
  return withAuth(async ({ companyId }) => {
    const parsed = z.object({ leadId: idSchema, status: leadStatusSchema }).parse({ leadId, status })
    const lead = await prisma.leadCapture.findFirst({
      where: { id: parsed.leadId, companyId },
      select: { id: true, clientId: true, opportunityId: true, status: true, updatedAt: true },
    })
    if (!lead) throw new Error("Prospect introuvable")
    if (lead.status === parsed.status) return { success: true as const }

    const eventId = await prisma.$transaction(async (tx) => {
      const changed = await tx.leadCapture.updateMany({ where: { id: lead.id, companyId, status: lead.status, updatedAt: lead.updatedAt }, data: { status: parsed.status } })
      if (changed.count !== 1) throw new Error("Le prospect a changé ; actualisez avant de modifier son statut")
      if (lead.opportunityId && ["CONTACTED", "QUALIFIED", "SPAM"].includes(parsed.status)) {
        await tx.opportunity.update({
          where: { id: lead.opportunityId },
          data: parsed.status === "SPAM"
            ? { status: "LOST", probability: 0, lostReason: "Spam ou demande invalide" }
            : { status: parsed.status, probability: parsed.status === "QUALIFIED" ? 35 : 20, lostReason: null },
        })
      }
      if (lead.clientId && parsed.status === "CONTACTED") {
        await tx.client.update({ where: { id: lead.clientId }, data: { nextActionAt: null, nextActionLabel: null } })
      }
      if (["SPAM", "ARCHIVED"].includes(parsed.status)) {
        await tx.emailSequenceEnrollment.updateMany({
          where: { leadCaptureId: lead.id, status: { in: ["ACTIVE", "PAUSED"] }, sequence: { companyId } },
          data: { status: "STOPPED", stopReason: `LEAD_${parsed.status}`, nextSendAt: null, completedAt: new Date() },
        })
      }
      return enqueueAutomationEvent(tx, { companyId, event: "LEAD_STATUS_CHANGED", eventKey: `${lead.id}:status:${parsed.status}:${crypto.randomUUID()}`, subjectModel: "LeadCapture", subjectId: lead.id, leadId: lead.id })
    })

    await dispatchAutomationEvent(eventId).catch((error) => console.error("Lead status automation deferred", error))
    await refreshSingleLeadIntelligence(companyId, lead.id).catch((error) => console.error("Lead scoring refresh failed", error))

    revalidatePath("/dashboard/leads")
    revalidatePath("/dashboard/pipeline")
    revalidatePath("/dashboard/clients")
    return { success: true as const }
  }, "crm.write")
}

export async function withdrawLeadMarketingConsent(leadId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedId = idSchema.parse(leadId)
    const lead = await prisma.leadCapture.findFirst({
      where: { id: parsedId, companyId },
      select: { id: true, clientId: true, contactId: true, email: true },
    })
    if (!lead) throw new Error("Prospect introuvable")
    const capturedAt = new Date()
    const recipientEmail = lead.email?.trim().toLowerCase() || null
    const proofHash = createHash("sha256").update(JSON.stringify({ companyId, leadId: lead.id, recipientEmail, userId, status: "WITHDRAWN", capturedAt: capturedAt.toISOString() })).digest("hex")

    await prisma.$transaction(async (tx) => {
      await tx.marketingConsent.create({
        data: {
          companyId,
          clientId: lead.clientId,
          contactId: lead.contactId,
          leadCaptureId: lead.id,
          recipientEmail,
          channel: "EMAIL",
          purpose: "MARKETING",
          status: "WITHDRAWN",
          legalBasis: "CONSENT",
          source: "BACKOFFICE",
          proofHash,
          capturedAt,
          withdrawnAt: capturedAt,
          metadata: { userId },
        },
      })
      await tx.leadCapture.update({ where: { id: lead.id }, data: { marketingOptIn: false } })
      if (lead.contactId) await tx.contact.update({ where: { id: lead.contactId }, data: { marketingStatus: "OPTED_OUT" } })
      await tx.emailSequenceEnrollment.updateMany({ where: { leadCaptureId: lead.id, status: "ACTIVE" }, data: { status: "STOPPED", stopReason: "CONSENT_WITHDRAWN", nextSendAt: null, completedAt: capturedAt } })
    })

    revalidatePath("/dashboard/leads")
    return { success: true as const }
  }, "crm.write")
}

export async function createLeadMarketingWithdrawalLink(leadId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = idSchema.parse(leadId)
    const lead = await prisma.leadCapture.findFirst({
      where: { id: parsedId, companyId, marketingOptIn: true },
      select: { id: true },
    })
    if (!lead) throw new Error("Ce prospect n'a pas de consentement marketing actif")

    const token = await createConsentWithdrawalToken({ companyId, leadId: lead.id })
    return { success: true as const, withdrawalPath: `/consent/withdraw/${token}` }
  }, "crm.write")
}
