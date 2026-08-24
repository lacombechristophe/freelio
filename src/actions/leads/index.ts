"use server"

import { createHash } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { runAutomationEvent } from "@/lib/automations/engine"
import { createConsentWithdrawalToken } from "@/lib/leads/consent-token"
import prisma from "@/lib/prisma"

const idSchema = z.string().cuid()
const leadStatusSchema = z.enum(["NEW", "CONTACTED", "QUALIFIED", "ARCHIVED", "SPAM"])

export async function getLeadDashboard() {
  return withAuth(async ({ companyId }) => {
    const leads = await prisma.leadCapture.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 150,
      include: {
        client: { select: { id: true, name: true, nextActionAt: true } },
        opportunity: { select: { id: true, title: true, status: true, valueCents: true } },
        consents: { orderBy: { capturedAt: "desc" }, take: 4, select: { id: true, channel: true, purpose: true, status: true, capturedAt: true } },
      },
    })

    const counts = { NEW: 0, CONTACTED: 0, QUALIFIED: 0, ARCHIVED: 0, SPAM: 0 }
    const sources = new Map<string, number>()
    for (const lead of leads) {
      if (lead.status in counts) counts[lead.status as keyof typeof counts] += 1
      sources.set(lead.source, (sources.get(lead.source) ?? 0) + 1)
    }

    return {
      counts,
      sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
      leads: leads.map((lead) => ({
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
        createdAt: lead.createdAt.toISOString(),
        client: lead.client ? { ...lead.client, nextActionAt: lead.client.nextActionAt?.toISOString() ?? null } : null,
        opportunity: lead.opportunity,
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
      select: { id: true, clientId: true, opportunityId: true },
    })
    if (!lead) throw new Error("Prospect introuvable")

    await prisma.$transaction(async (tx) => {
      await tx.leadCapture.update({ where: { id: lead.id }, data: { status: parsed.status } })
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
    })

    if (["SPAM", "ARCHIVED"].includes(parsed.status)) {
      await prisma.emailSequenceEnrollment.updateMany({
        where: { leadCaptureId: lead.id, status: "ACTIVE", sequence: { companyId } },
        data: { status: "STOPPED", stopReason: `LEAD_${parsed.status}`, nextSendAt: null, completedAt: new Date() },
      })
    }
    await runAutomationEvent({
      companyId,
      event: "LEAD_STATUS_CHANGED",
      eventKey: `${lead.id}:status:${parsed.status}`,
      subjectModel: "LeadCapture",
      subjectId: lead.id,
      leadId: lead.id,
    }).catch((error) => console.error("Lead status automation failed", error))

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
      select: { id: true, clientId: true, contactId: true },
    })
    if (!lead) throw new Error("Prospect introuvable")
    const capturedAt = new Date()
    const proofHash = createHash("sha256").update(JSON.stringify({ companyId, leadId: lead.id, userId, status: "WITHDRAWN", capturedAt: capturedAt.toISOString() })).digest("hex")

    await prisma.$transaction(async (tx) => {
      await tx.marketingConsent.create({
        data: {
          companyId,
          clientId: lead.clientId,
          contactId: lead.contactId,
          leadCaptureId: lead.id,
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
