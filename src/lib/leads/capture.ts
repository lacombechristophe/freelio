import "server-only"

import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"

import { publicLeadSchema, normalizePhone, type PublicLeadInput } from "@/lib/leads/schema"
import { runAutomationEvent } from "@/lib/automations/engine"
import prisma from "@/lib/prisma"

export class LeadConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LeadConfigurationError"
  }
}

type RequestEvidence = {
  ipHash?: string
  userAgentHash?: string
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function hashLeadRequestValue(value: string) {
  const salt = process.env.LEAD_HASH_SALT || process.env.AUTH_SECRET || "crm-development-only"
  return sha256(`${salt}\u0000${value}`)
}

async function resolveLeadCompany() {
  const configuredId = process.env.PUBLIC_LEAD_COMPANY_ID?.trim()
  if (configuredId) {
    const company = await prisma.company.findUnique({ where: { id: configuredId }, select: { id: true, name: true } })
    if (!company) throw new LeadConfigurationError("PUBLIC_LEAD_COMPANY_ID ne correspond à aucune société.")
    return company
  }

  if (process.env.NODE_ENV === "production") {
    throw new LeadConfigurationError("PUBLIC_LEAD_COMPANY_ID doit être configuré en production.")
  }

  const company = await prisma.company.findFirst({ orderBy: { id: "asc" }, select: { id: true, name: true } })
  if (!company) throw new LeadConfigurationError("Créez d’abord une société ou configurez PUBLIC_LEAD_COMPANY_ID.")
  return company
}

function canonicalLeadFingerprint(companyId: string, input: PublicLeadInput) {
  return sha256(JSON.stringify({
    companyId,
    email: input.email?.toLowerCase() || null,
    phone: normalizePhone(input.phone) || null,
    projectType: input.projectType?.toLowerCase() || null,
    message: input.message?.toLowerCase() || null,
  }))
}

function consentProofHash(input: {
  companyId: string
  leadCaptureId: string
  channel: string
  purpose: string
  status: string
  legalBasis: string
  noticeUrl: string
  capturedAt: Date
  evidence: RequestEvidence
}) {
  return sha256(JSON.stringify({
    ...input,
    capturedAt: input.capturedAt.toISOString(),
  }))
}

export async function capturePublicLead(rawInput: unknown, evidence: RequestEvidence = {}) {
  const input = publicLeadSchema.parse(rawInput)
  const company = await resolveLeadCompany()
  const email = input.email?.toLowerCase()
  const phone = normalizePhone(input.phone)
  const fingerprint = canonicalLeadFingerprint(company.id, input)
  const dedupeThreshold = new Date(Date.now() - 10 * 60 * 1_000)
  const duplicate = await prisma.leadCapture.findFirst({
    where: { companyId: company.id, fingerprint, createdAt: { gte: dedupeThreshold } },
    orderBy: { createdAt: "desc" },
    select: { id: true, clientId: true, opportunityId: true },
  })

  if (duplicate) {
    return { accepted: true as const, duplicate: true as const, reference: duplicate.id }
  }

  const configuredNoticeUrl = process.env.PUBLIC_PRIVACY_NOTICE_URL?.trim()
  if (!configuredNoticeUrl && process.env.NODE_ENV === "production") {
    throw new LeadConfigurationError("PUBLIC_PRIVACY_NOTICE_URL doit être configuré en production.")
  }
  const noticeUrl = configuredNoticeUrl || `${process.env.AUTH_URL || "http://localhost:3000"}/conformite`
  const result = await prisma.$transaction(async (tx) => {
    const identityConditions: Prisma.ContactWhereInput[] = []
    if (email) identityConditions.push({ email })
    if (phone) identityConditions.push({ phone })

    let contact = await tx.contact.findFirst({
      where: { client: { companyId: company.id }, OR: identityConditions },
      select: { id: true, clientId: true, firstName: true, lastName: true, email: true, phone: true },
    })

    let clientId: string
    if (contact) {
      clientId = contact.clientId
      contact = await tx.contact.update({
        where: { id: contact.id },
        data: {
          firstName: contact.firstName || input.firstName,
          lastName: contact.lastName || input.lastName,
          email: contact.email || email,
          phone: contact.phone || phone,
          lifecycleStage: "LEAD",
          ...(input.marketingOptIn ? { marketingStatus: "OPTED_IN" } : {}),
        },
        select: { id: true, clientId: true, firstName: true, lastName: true, email: true, phone: true },
      })
    } else {
      const client = await tx.client.create({
        data: {
          companyId: company.id,
          name: `${input.firstName} ${input.lastName}`.trim(),
          type: "INDIVIDUAL",
          lifecycleStage: "LEAD",
          nextActionAt: new Date(Date.now() + 48 * 60 * 60 * 1_000),
          nextActionLabel: "Rappeler le prospect sous 48 h",
        },
        select: { id: true },
      })
      clientId = client.id
      contact = await tx.contact.create({
        data: {
          clientId,
          firstName: input.firstName,
          lastName: input.lastName,
          email,
          phone,
          isPrimary: true,
          lifecycleStage: "LEAD",
          marketingStatus: input.marketingOptIn ? "OPTED_IN" : "NOT_OPTED_IN",
        },
        select: { id: true, clientId: true, firstName: true, lastName: true, email: true, phone: true },
      })
    }

    await tx.client.update({
      where: { id: clientId },
      data: {
        lifecycleStage: "LEAD",
        nextActionAt: new Date(Date.now() + 48 * 60 * 60 * 1_000),
        nextActionLabel: "Rappeler le prospect sous 48 h",
      },
    })

    const pipeline = await tx.pipeline.upsert({
      where: { companyId: company.id },
      update: {},
      create: {
        companyId: company.id,
        name: "Pipeline commercial",
        stages: [
          { id: "PROSPECT", title: "Prospect" },
          { id: "CONTACTED", title: "Contact pris" },
          { id: "QUALIFIED", title: "Besoin qualifié" },
          { id: "SENT", title: "Devis envoyé" },
          { id: "WON", title: "Gagné" },
          { id: "LOST", title: "Perdu" },
        ],
      },
      select: { id: true },
    })
    const opportunity = await tx.opportunity.create({
      data: {
        pipelineId: pipeline.id,
        clientId,
        title: input.projectType ? `${input.projectType} · ${input.firstName} ${input.lastName}` : `Projet · ${input.firstName} ${input.lastName}`,
        status: "PROSPECT",
        probability: 10,
        customFields: {
          source: input.source.toUpperCase(),
          postalCode: input.postalCode,
          city: input.city,
          message: input.message,
          landingPage: input.landingPage,
          referrer: input.referrer,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmContent: input.utmContent,
          utmTerm: input.utmTerm,
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    })
    const lead = await tx.leadCapture.create({
      data: {
        companyId: company.id,
        clientId,
        contactId: contact.id,
        opportunityId: opportunity.id,
        firstName: input.firstName,
        lastName: input.lastName,
        email,
        phone,
        postalCode: input.postalCode,
        city: input.city,
        projectType: input.projectType,
        message: input.message,
        source: input.source.toUpperCase(),
        landingPage: input.landingPage,
        referrer: input.referrer,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmContent: input.utmContent,
        utmTerm: input.utmTerm,
        privacyAccepted: input.privacyAccepted,
        marketingOptIn: input.marketingOptIn,
        fingerprint,
        ipHash: evidence.ipHash,
        userAgentHash: evidence.userAgentHash,
      },
      select: { id: true },
    })

    const capturedAt = new Date()
    const consentEvents = [
      { channel: "FORM", purpose: "SERVICE_REQUEST", status: "ACKNOWLEDGED", legalBasis: "PRE_CONTRACTUAL" },
      { channel: "EMAIL", purpose: "MARKETING", status: input.marketingOptIn ? "GRANTED" : "DECLINED", legalBasis: "CONSENT" },
    ]
    await tx.marketingConsent.createMany({
      data: consentEvents.map((event) => ({
        companyId: company.id,
        clientId,
        contactId: contact.id,
        leadCaptureId: lead.id,
        ...event,
        source: input.source.toUpperCase(),
        noticeUrl,
        noticeLabel: "Politique de confidentialité",
        capturedAt,
        proofHash: consentProofHash({ companyId: company.id, leadCaptureId: lead.id, ...event, noticeUrl, capturedAt, evidence }),
        metadata: {
          landingPage: input.landingPage,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          ipHash: evidence.ipHash,
          userAgentHash: evidence.userAgentHash,
        } as Prisma.InputJsonValue,
      })),
    })

    const recipients = await tx.membership.findMany({
      where: { companyId: company.id, status: "ACTIVE", role: { in: ["OWNER", "ADMIN", "SALES"] } },
      select: { userId: true },
      take: 20,
    })
    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map(({ userId }) => ({
          userId,
          type: "LEAD_CREATED",
          title: "Nouveau prospect",
          message: `${input.firstName} ${input.lastName}${input.projectType ? ` · ${input.projectType}` : ""}`,
        })),
      })
    }

    return { reference: lead.id, clientId, opportunityId: opportunity.id }
  })

  await runAutomationEvent({
    companyId: company.id,
    event: "LEAD_CREATED",
    eventKey: `${result.reference}:created`,
    subjectModel: "LeadCapture",
    subjectId: result.reference,
    leadId: result.reference,
  }).catch((error) => console.error("Lead automation failed", error))

  return { accepted: true as const, duplicate: false as const, ...result }
}
