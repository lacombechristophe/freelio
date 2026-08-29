"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import { diagnosticSteps, diagnosticStringList } from "@/lib/operations/service-diagnostics"
import prisma from "@/lib/prisma"

const cuid = z.string().cuid()
const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : undefined,
  z.string().max(max).optional(),
)

const guideSchema = z.object({
  name: z.string().trim().min(2).max(120),
  productCategory: optionalText(120),
  manufacturer: optionalText(120),
  modelPattern: optionalText(120),
  symptom: z.string().trim().min(2).max(240),
  keywordsText: optionalText(1_000),
  stepsText: z.string().trim().min(3).max(8_000),
  resolutionHintsText: optionalText(4_000),
  warrantyInstructions: optionalText(4_000),
  outOfWarrantyInstructions: optionalText(4_000),
  priority: z.coerce.number().int().min(0).max(10).default(0),
})

const completionSchema = z.object({
  ticketId: cuid,
  guideId: cuid,
  symptom: z.string().trim().min(2).max(500),
  completedStepIds: z.array(z.string().trim().min(1).max(80)).max(30),
  warrantyStatus: z.enum(["COVERED", "EXPIRED", "UNKNOWN", "NOT_APPLICABLE"]),
  outcome: z.string().trim().min(3).max(5_000),
  recommendedAction: optionalText(2_000),
})

function textLines(value: string | undefined, limit: number) {
  return (value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit)
}

function guideData(input: unknown) {
  const data = guideSchema.parse(input)
  const steps = textLines(data.stepsText, 30).map((raw, index) => {
    const optional = raw.startsWith("?")
    const label = (optional ? raw.slice(1) : raw).trim()
    if (!label) throw new Error(`Le contrôle ${index + 1} est vide`)
    return { id: `step-${index + 1}`, label, required: !optional }
  })
  if (steps.length === 0) throw new Error("Ajoutez au moins un point de contrôle")
  return {
    name: data.name,
    productCategory: data.productCategory || null,
    manufacturer: data.manufacturer || null,
    modelPattern: data.modelPattern || null,
    symptom: data.symptom,
    keywords: (data.keywordsText || "").split(",").map((item) => item.trim()).filter(Boolean).slice(0, 50),
    steps,
    resolutionHints: textLines(data.resolutionHintsText, 30),
    warrantyInstructions: data.warrantyInstructions || null,
    outOfWarrantyInstructions: data.outOfWarrantyInstructions || null,
    priority: data.priority,
  }
}

function editableGuide(guide: {
  id: string
  name: string
  productCategory: string | null
  manufacturer: string | null
  modelPattern: string | null
  symptom: string
  keywords: unknown
  steps: unknown
  resolutionHints: unknown
  warrantyInstructions: string | null
  outOfWarrantyInstructions: string | null
  priority: number
  createdAt: Date
  updatedAt: Date
}) {
  return {
    ...guide,
    keywords: diagnosticStringList(guide.keywords),
    steps: diagnosticSteps(guide.steps),
    resolutionHints: diagnosticStringList(guide.resolutionHints),
  }
}

export async function getServiceDiagnosticGuides() {
  return withAuth(async ({ companyId }) => {
    const guides = await prisma.serviceDiagnosticGuide.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
      take: 200,
    })
    return guides.map(editableGuide)
  }, "service.read")
}

export async function createServiceDiagnosticGuide(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = guideData(input)
    if (await prisma.serviceDiagnosticGuide.findFirst({ where: { companyId, name: data.name }, select: { id: true } })) {
      throw new Error("Un guide porte déjà ce nom")
    }
    const guide = await prisma.serviceDiagnosticGuide.create({ data: { companyId, ...data } })
    await logAction({ userId, action: "CREATE_SERVICE_DIAGNOSTIC_GUIDE", resource: "SERVICE_DIAGNOSTIC_GUIDE", resourceId: guide.id, payload: { name: guide.name } })
    revalidatePath("/dashboard/service/diagnostics")
    return { success: true as const, id: guide.id }
  }, "service.write")
}

export async function updateServiceDiagnosticGuide(guideId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(guideId)
    const data = guideData(input)
    const guide = await prisma.serviceDiagnosticGuide.findFirst({ where: { id, companyId, status: "ACTIVE" }, select: { id: true } })
    if (!guide) throw new Error("Guide de diagnostic introuvable")
    if (await prisma.serviceDiagnosticGuide.findFirst({ where: { companyId, name: data.name, id: { not: guide.id } }, select: { id: true } })) {
      throw new Error("Un guide porte déjà ce nom")
    }
    await prisma.serviceDiagnosticGuide.update({ where: { id: guide.id }, data })
    await logAction({ userId, action: "UPDATE_SERVICE_DIAGNOSTIC_GUIDE", resource: "SERVICE_DIAGNOSTIC_GUIDE", resourceId: guide.id, payload: { name: data.name } })
    revalidatePath("/dashboard/service/diagnostics")
    revalidatePath("/dashboard/service/tickets/[id]", "page")
    return { success: true as const }
  }, "service.write")
}

export async function archiveServiceDiagnosticGuide(guideId: string) {
  return withAuth(async ({ companyId, userId }) => {
    const id = cuid.parse(guideId)
    const guide = await prisma.serviceDiagnosticGuide.findFirst({ where: { id, companyId, status: "ACTIVE" }, select: { id: true, name: true } })
    if (!guide) throw new Error("Guide de diagnostic introuvable")
    await prisma.serviceDiagnosticGuide.update({ where: { id: guide.id }, data: { status: "ARCHIVED" } })
    await logAction({ userId, action: "ARCHIVE_SERVICE_DIAGNOSTIC_GUIDE", resource: "SERVICE_DIAGNOSTIC_GUIDE", resourceId: guide.id, payload: { name: guide.name } })
    revalidatePath("/dashboard/service/diagnostics")
    revalidatePath("/dashboard/service/tickets/[id]", "page")
    return { success: true as const }
  }, "service.write")
}

export async function completeServiceTicketDiagnostic(input: unknown) {
  return withAuth(async ({ companyId, membershipId, userId }) => {
    const data = completionSchema.parse(input)
    const [ticket, guide] = await Promise.all([
      prisma.serviceTicket.findFirst({
        where: { id: data.ticketId, companyId, status: { not: "MERGED" }, mergedIntoTicketId: null },
        select: { id: true, number: true, equipment: { select: { category: true, manufacturer: true, model: true, serialNumber: true, warrantyUntil: true } } },
      }),
      prisma.serviceDiagnosticGuide.findFirst({ where: { id: data.guideId, companyId, status: "ACTIVE" } }),
    ])
    if (!ticket) throw new Error("Ticket introuvable ou déjà fusionné")
    if (!guide) throw new Error("Guide de diagnostic introuvable ou archivé")

    const steps = diagnosticSteps(guide.steps)
    const knownStepIds = new Set(steps.map((step) => step.id))
    if (data.completedStepIds.some((stepId) => !knownStepIds.has(stepId))) throw new Error("La liste des contrôles ne correspond plus au guide")
    const completedStepIds = [...new Set(data.completedStepIds)]
    const missingRequired = steps.filter((step) => step.required && !completedStepIds.includes(step.id))
    if (missingRequired.length > 0) throw new Error(`Contrôles obligatoires manquants : ${missingRequired.map((step) => step.label).join(", ")}`)

    const guideSnapshot = {
      name: guide.name,
      productCategory: guide.productCategory,
      manufacturer: guide.manufacturer,
      modelPattern: guide.modelPattern,
      symptom: guide.symptom,
      keywords: diagnosticStringList(guide.keywords),
      steps,
      resolutionHints: diagnosticStringList(guide.resolutionHints),
      warrantyInstructions: guide.warrantyInstructions,
      outOfWarrantyInstructions: guide.outOfWarrantyInstructions,
      equipment: ticket.equipment ? {
        category: ticket.equipment.category,
        manufacturer: ticket.equipment.manufacturer,
        model: ticket.equipment.model,
        serialNumber: ticket.equipment.serialNumber,
        warrantyUntil: ticket.equipment.warrantyUntil?.toISOString() || null,
      } : null,
    }
    const diagnostic = await prisma.serviceTicketDiagnostic.create({
      data: {
        companyId,
        ticketId: ticket.id,
        guideId: guide.id,
        performedByMembershipId: membershipId,
        guideSnapshot,
        completedStepIds,
        warrantyStatus: data.warrantyStatus,
        symptom: data.symptom,
        outcome: data.outcome,
        recommendedAction: data.recommendedAction || null,
      },
    })
    await logAction({ userId, action: "COMPLETE_SERVICE_TICKET_DIAGNOSTIC", resource: "SERVICE_TICKET", resourceId: ticket.id, payload: { diagnosticId: diagnostic.id, guideId: guide.id, ticketNumber: ticket.number, warrantyStatus: data.warrantyStatus } })
    revalidatePath(`/dashboard/service/tickets/${ticket.id}`)
    return { success: true as const, id: diagnostic.id }
  }, "service.write")
}
