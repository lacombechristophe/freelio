"use server"

import { createHash, randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { sanitizeSequenceEmailHtml } from "@/lib/automations/email"
import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import prisma from "@/lib/prisma"
import { satisfactionMetrics, serviceArticleSlug } from "@/lib/service-content"

const cuid = z.string().cuid()
const articleSchema = z.object({
  title: z.string().trim().min(3).max(180),
  slug: z.string().trim().max(120).optional(),
  summary: z.string().trim().max(500).optional(),
  bodyHtml: z.string().trim().min(3).max(100_000),
  category: z.string().trim().max(100).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("DRAFT"),
  visibility: z.enum(["INTERNAL", "PORTAL"]).default("INTERNAL"),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
})
const surveySchema = z.object({
  name: z.string().trim().min(3).max(140),
  type: z.enum(["CSAT", "NPS", "CES"]).default("CSAT"),
  question: z.string().trim().min(5).max(300),
  scaleMin: z.coerce.number().int().min(0).max(10),
  scaleMax: z.coerce.number().int().min(1).max(10),
  followUpQuestion: z.string().trim().max(300).optional(),
  triggerEvent: z.enum(["TICKET_CLOSED", "INTERVENTION_COMPLETED", "MANUAL"]).default("TICKET_CLOSED"),
  delayHours: z.coerce.number().int().min(0).max(720).default(2),
  anonymous: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.scaleMax <= value.scaleMin) context.addIssue({ code: "custom", path: ["scaleMax"], message: "L’échelle maximale doit être supérieure au minimum" })
  if (value.type === "NPS" && (value.scaleMin !== 0 || value.scaleMax !== 10)) context.addIssue({ code: "custom", path: ["scaleMax"], message: "Une enquête NPS utilise l’échelle 0 à 10" })
})
const requestSchema = z.object({
  surveyId: cuid,
  clientId: cuid,
  contactId: z.union([cuid, z.literal("")]).optional(),
  serviceTicketId: z.union([cuid, z.literal("")]).optional(),
  expiresInDays: z.coerce.number().int().min(1).max(180).default(30),
})
const responseSchema = z.object({ score: z.coerce.number().int().min(0).max(10), comment: z.string().trim().max(3_000).optional() })

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function appBaseUrl() {
  const configured = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL
  if (!configured && process.env.NODE_ENV === "production") throw new Error("PUBLIC_APP_URL est requis pour créer un lien de satisfaction")
  return (configured || "http://localhost:3000").replace(/\/$/, "")
}

async function uniqueSlug(companyId: string, requested: string, excludeId?: string) {
  const base = serviceArticleSlug(requested)
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? base : `${base}-${index + 1}`
    const existing = await prisma.knowledgeArticle.findFirst({ where: { companyId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { id: true } })
    if (!existing) return slug
  }
  throw new Error("Impossible de générer une adresse unique pour cet article")
}

export async function getServiceContentDashboard() {
  return withAuth(async ({ companyId }) => {
    const [articles, surveys, requests, clients, tickets] = await Promise.all([
      prisma.knowledgeArticle.findMany({
        where: { companyId, status: { not: "ARCHIVED" } },
        include: { authorMembership: { select: { user: { select: { name: true, email: true } } } } },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.satisfactionSurvey.findMany({ where: { companyId, status: { not: "ARCHIVED" } }, include: { _count: { select: { requests: true } } }, orderBy: { updatedAt: "desc" } }),
      prisma.satisfactionRequest.findMany({
        where: { companyId },
        include: {
          survey: { select: { name: true, type: true, scaleMin: true, scaleMax: true, anonymous: true } },
          client: { select: { id: true, name: true } },
          contact: { select: { firstName: true, lastName: true, email: true } },
          serviceTicket: { select: { id: true, number: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      prisma.client.findMany({ where: { companyId }, select: { id: true, name: true, contacts: { select: { id: true, firstName: true, lastName: true, email: true }, orderBy: [{ isPrimary: "desc" }, { lastName: "asc" }] } }, orderBy: { name: "asc" }, take: 500 }),
      prisma.serviceTicket.findMany({ where: { companyId }, select: { id: true, clientId: true, number: true, title: true, status: true }, orderBy: { requestedAt: "desc" }, take: 300 }),
    ])
    const metrics = satisfactionMetrics(requests.flatMap((item) => item.score == null ? [] : [{ type: item.survey.type, scaleMin: item.survey.scaleMin, scaleMax: item.survey.scaleMax, score: item.score }]))
    return {
      metrics,
      articles: articles.map((item) => ({ ...item, tags: Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string") : [], publishedAt: item.publishedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
      surveys: surveys.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
      requests: requests.map((item) => ({ ...item, client: item.survey.anonymous ? { id: item.client.id, name: "Réponse anonyme" } : item.client, contact: item.survey.anonymous ? null : item.contact, serviceTicket: item.survey.anonymous ? null : item.serviceTicket, expiresAt: item.expiresAt.toISOString(), sentAt: item.sentAt?.toISOString() ?? null, respondedAt: item.respondedAt?.toISOString() ?? null, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })),
      clients,
      tickets,
    }
  }, "service.read")
}

export async function createKnowledgeArticle(input: unknown) {
  return withAuth(async ({ companyId, membershipId, userId }) => {
    const data = articleSchema.parse(input)
    const slug = await uniqueSlug(companyId, data.slug || data.title)
    const article = await prisma.knowledgeArticle.create({ data: { companyId, authorMembershipId: membershipId, title: data.title, slug, summary: data.summary || null, bodyHtml: sanitizeSequenceEmailHtml(data.bodyHtml), category: data.category || null, status: data.status, visibility: data.visibility, tags: data.tags, publishedAt: data.status === "PUBLISHED" ? new Date() : null } })
    await logAction({ userId, action: "CREATE_KNOWLEDGE_ARTICLE", resource: "KNOWLEDGE_ARTICLE", resourceId: article.id, payload: { title: article.title, status: article.status, visibility: article.visibility } })
    revalidatePath("/dashboard/service/connaissance")
    revalidatePath("/portal")
    return { success: true as const, id: article.id }
  }, "service.write")
}

export async function updateKnowledgeArticle(articleId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(articleId)
    const data = articleSchema.parse(input)
    const existing = await prisma.knowledgeArticle.findFirst({ where: { id, companyId }, select: { id: true, publishedAt: true } })
    if (!existing) throw new Error("Article introuvable")
    const slug = await uniqueSlug(companyId, data.slug || data.title, id)
    const article = await prisma.knowledgeArticle.update({ where: { id }, data: { title: data.title, slug, summary: data.summary || null, bodyHtml: sanitizeSequenceEmailHtml(data.bodyHtml), category: data.category || null, status: data.status, visibility: data.visibility, tags: data.tags, publishedAt: data.status === "PUBLISHED" ? existing.publishedAt || new Date() : null } })
    await logAction({ userId, action: "UPDATE_KNOWLEDGE_ARTICLE", resource: "KNOWLEDGE_ARTICLE", resourceId: article.id, payload: { title: article.title, status: article.status, visibility: article.visibility } })
    revalidatePath("/dashboard/service/connaissance")
    revalidatePath("/portal")
    return { success: true as const }
  }, "service.write")
}

export async function createSatisfactionSurvey(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = surveySchema.parse(input)
    const survey = await prisma.satisfactionSurvey.create({ data: { companyId, ...data, followUpQuestion: data.followUpQuestion || null } })
    await logAction({ userId, action: "CREATE_SATISFACTION_SURVEY", resource: "SATISFACTION_SURVEY", resourceId: survey.id, payload: { name: survey.name, type: survey.type } })
    revalidatePath("/dashboard/service/satisfaction")
    return { success: true as const, id: survey.id }
  }, "service.write")
}

export async function createSatisfactionRequest(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = requestSchema.parse(input)
    const [survey, client, contact, ticket] = await Promise.all([
      prisma.satisfactionSurvey.findFirst({ where: { id: data.surveyId, companyId, status: "ACTIVE" }, select: { id: true } }),
      prisma.client.findFirst({ where: { id: data.clientId, companyId }, select: { id: true } }),
      data.contactId ? prisma.contact.findFirst({ where: { id: data.contactId, clientId: data.clientId, client: { companyId } }, select: { id: true } }) : null,
      data.serviceTicketId ? prisma.serviceTicket.findFirst({ where: { id: data.serviceTicketId, clientId: data.clientId, companyId }, select: { id: true } }) : null,
    ])
    if (!survey || !client) throw new Error("Enquête ou client introuvable")
    if (data.contactId && !contact) throw new Error("Le contact ne correspond pas à ce client")
    if (data.serviceTicketId && !ticket) throw new Error("Le ticket ne correspond pas à ce client")
    const token = randomBytes(32).toString("base64url")
    const request = await prisma.satisfactionRequest.create({ data: { companyId, surveyId: survey.id, clientId: client.id, contactId: contact?.id || null, serviceTicketId: ticket?.id || null, tokenHash: tokenHash(token), expiresAt: new Date(Date.now() + data.expiresInDays * 86_400_000) } })
    await logAction({ userId, action: "CREATE_SATISFACTION_REQUEST", resource: "SATISFACTION_REQUEST", resourceId: request.id, payload: { surveyId: survey.id, clientId: client.id, serviceTicketId: ticket?.id || null } })
    revalidatePath("/dashboard/service/satisfaction")
    return { success: true as const, id: request.id, url: `${appBaseUrl()}/feedback/${token}` }
  }, "service.write")
}

export async function getPublicSatisfactionRequest(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null
  const request = await prisma.satisfactionRequest.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: { id: true, status: true, expiresAt: true, respondedAt: true, createdAt: true, updatedAt: true, company: { select: { name: true, logo: true, brandColor: true } }, survey: { select: { name: true, type: true, question: true, followUpQuestion: true, scaleMin: true, scaleMax: true, anonymous: true } }, client: { select: { name: true } }, contact: { select: { firstName: true } }, serviceTicket: { select: { number: true, title: true } } },
  })
  if (!request) return null
  return { ...request, expiresAt: request.expiresAt.toISOString(), respondedAt: request.respondedAt?.toISOString() ?? null, createdAt: request.createdAt.toISOString(), updatedAt: request.updatedAt.toISOString() }
}

export async function submitPublicSatisfactionResponse(token: string, input: unknown) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("Lien invalide")
  const data = responseSchema.parse(input)
  const request = await prisma.satisfactionRequest.findUnique({ where: { tokenHash: tokenHash(token) }, include: { survey: { select: { scaleMin: true, scaleMax: true } } } })
  if (!request || request.status !== "PENDING") throw new Error("Cette enquête a déjà été traitée ou n’est plus disponible")
  if (request.expiresAt <= new Date()) {
    await prisma.satisfactionRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "EXPIRED" } })
    throw new Error("Cette enquête a expiré")
  }
  if (data.score < request.survey.scaleMin || data.score > request.survey.scaleMax) throw new Error("La note ne correspond pas à l’échelle de cette enquête")
  const updated = await prisma.satisfactionRequest.updateMany({ where: { id: request.id, status: "PENDING" }, data: { status: "RESPONDED", score: data.score, comment: data.comment || null, respondedAt: new Date() } })
  if (updated.count !== 1) throw new Error("Cette enquête vient déjà d’être traitée")
  revalidatePath("/dashboard/service/satisfaction")
  return { success: true as const }
}
