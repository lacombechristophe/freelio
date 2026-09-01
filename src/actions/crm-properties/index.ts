"use server"

import { Prisma } from "@prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { logAction } from "@/lib/audit"
import { withAuth } from "@/lib/auth-wrapper"
import {
  CRM_PROPERTY_PRESETS,
  crmObjectTypeSchema,
  crmPropertyDefinitionSchema,
  crmPropertyOptionSchema,
  parseCrmPropertyValue,
  type CrmObjectType,
} from "@/lib/crm-properties"
import type { Permission } from "@/lib/permissions"
import prisma from "@/lib/prisma"

const idSchema = z.string().cuid()
const definitionUpdateSchema = z.object({
  label: z.string().trim().min(2, "Le libellé est requis").max(120),
  groupName: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  options: z.array(crmPropertyOptionSchema).max(50).default([]),
  required: z.boolean().default(false),
})
const valuesInputSchema = z.object({
  objectType: crmObjectTypeSchema,
  recordId: idSchema,
  values: z.record(idSchema, z.unknown()),
})

const READ_PERMISSIONS: Record<CrmObjectType, Permission> = {
  CLIENT: "crm.read",
  CONTACT: "crm.read",
  OPPORTUNITY: "sales.read",
  PROJECT: "operations.read",
  TICKET: "service.read",
  EQUIPMENT: "operations.read",
}

const WRITE_PERMISSIONS: Record<CrmObjectType, Permission> = {
  CLIENT: "crm.write",
  CONTACT: "crm.write",
  OPPORTUNITY: "sales.write",
  PROJECT: "operations.write",
  TICKET: "service.write",
  EQUIPMENT: "operations.write",
}

async function recordExists(companyId: string, objectType: CrmObjectType, recordId: string) {
  if (objectType === "CLIENT") return Boolean(await prisma.client.findFirst({ where: { id: recordId, companyId }, select: { id: true } }))
  if (objectType === "CONTACT") return Boolean(await prisma.contact.findFirst({ where: { id: recordId, client: { companyId } }, select: { id: true } }))
  if (objectType === "OPPORTUNITY") return Boolean(await prisma.opportunity.findFirst({ where: { id: recordId, pipeline: { companyId } }, select: { id: true } }))
  if (objectType === "PROJECT") return Boolean(await prisma.project.findFirst({ where: { id: recordId, companyId }, select: { id: true } }))
  if (objectType === "TICKET") return Boolean(await prisma.serviceTicket.findFirst({ where: { id: recordId, companyId }, select: { id: true } }))
  return Boolean(await prisma.equipment.findFirst({ where: { id: recordId, companyId }, select: { id: true } }))
}

function definitionOutput<T extends { options: unknown; createdAt: Date; updatedAt: Date; archivedAt: Date | null }>(definition: T) {
  return {
    ...definition,
    options: Array.isArray(definition.options) ? definition.options : [],
    createdAt: definition.createdAt.toISOString(),
    updatedAt: definition.updatedAt.toISOString(),
    archivedAt: definition.archivedAt?.toISOString() ?? null,
  }
}

export async function getCrmPropertyDefinitions(objectType?: string, includeArchived = false) {
  return withAuth(async ({ companyId }) => {
    const parsedObjectType = objectType ? crmObjectTypeSchema.parse(objectType) : undefined
    const definitions = await prisma.crmPropertyDefinition.findMany({
      where: {
        companyId,
        ...(parsedObjectType ? { objectType: parsedObjectType } : {}),
        ...(!includeArchived ? { archivedAt: null } : {}),
      },
      include: { _count: { select: { values: true } } },
      orderBy: [{ objectType: "asc" }, { groupName: "asc" }, { position: "asc" }, { label: "asc" }],
    })
    return definitions.map(definitionOutput)
  }, "company.manage")
}

export async function createCrmPropertyDefinition(input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const data = crmPropertyDefinitionSchema.parse(input)
    const existing = await prisma.crmPropertyDefinition.findFirst({
      where: { companyId, objectType: data.objectType, key: data.key },
      select: { id: true },
    })
    if (existing) throw new Error("Une propriété utilise déjà cette clé pour cet objet")
    const position = await prisma.crmPropertyDefinition.count({ where: { companyId, objectType: data.objectType, archivedAt: null } })
    const definition = await prisma.crmPropertyDefinition.create({
      data: { ...data, description: data.description || null, options: data.options, companyId, position },
    })
    await logAction({ userId, action: "CREATE_CRM_PROPERTY", resource: "CRM_PROPERTY", resourceId: definition.id, payload: { objectType: data.objectType, key: data.key, type: data.type } })
    revalidatePath("/dashboard/settings/properties")
    return { success: true as const, definition: definitionOutput(definition) }
  }, "company.manage")
}

export async function updateCrmPropertyDefinition(definitionId: string, input: unknown) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(definitionId)
    const data = definitionUpdateSchema.parse(input)
    const existing = await prisma.crmPropertyDefinition.findFirst({ where: { id, companyId } })
    if (!existing) throw new Error("Propriété introuvable")
    const validated = crmPropertyDefinitionSchema.parse({
      objectType: existing.objectType,
      key: existing.key,
      type: existing.type,
      ...data,
    })
    const definition = await prisma.crmPropertyDefinition.update({
      where: { id: existing.id },
      data: {
        label: validated.label,
        groupName: validated.groupName,
        description: validated.description || null,
        options: validated.options,
        required: validated.required,
      },
    })
    await logAction({ userId, action: "UPDATE_CRM_PROPERTY", resource: "CRM_PROPERTY", resourceId: definition.id, payload: { objectType: definition.objectType, key: definition.key } })
    revalidatePath("/dashboard/settings/properties")
    return { success: true as const, definition: definitionOutput(definition) }
  }, "company.manage")
}

export async function setCrmPropertyArchived(definitionId: string, archived: boolean) {
  return withAuth(async ({ companyId, userId }) => {
    const id = idSchema.parse(definitionId)
    const existing = await prisma.crmPropertyDefinition.findFirst({ where: { id, companyId }, select: { id: true, objectType: true, key: true } })
    if (!existing) throw new Error("Propriété introuvable")
    await prisma.crmPropertyDefinition.update({ where: { id: existing.id }, data: { archivedAt: archived ? new Date() : null } })
    await logAction({ userId, action: "ARCHIVE_CRM_PROPERTY", resource: "CRM_PROPERTY", resourceId: existing.id, payload: { archived, objectType: existing.objectType, key: existing.key } })
    revalidatePath("/dashboard/settings/properties")
    return { success: true as const }
  }, "company.manage")
}

export async function installCrmPropertyPreset(objectType: string) {
  return withAuth(async ({ companyId, userId }) => {
    const parsedObjectType = crmObjectTypeSchema.parse(objectType)
    const preset = CRM_PROPERTY_PRESETS[parsedObjectType]
    const existing = await prisma.crmPropertyDefinition.findMany({
      where: { companyId, objectType: parsedObjectType },
      select: { key: true },
    })
    const existingKeys = new Set(existing.map((definition) => definition.key))
    const missing = preset.filter((definition) => !existingKeys.has(definition.key))
    if (missing.length) {
      const basePosition = existing.length
      await prisma.crmPropertyDefinition.createMany({
        data: missing.map((definition, index) => ({ ...definition, description: definition.description || null, options: definition.options, companyId, position: basePosition + index })),
      })
    }
    await logAction({ userId, action: "INSTALL_CRM_PROPERTY_PRESET", resource: "CRM_PROPERTY", resourceId: companyId, payload: { objectType: parsedObjectType, installed: missing.length } })
    revalidatePath("/dashboard/settings/properties")
    return { success: true as const, installed: missing.length }
  }, "company.manage")
}

export async function getRecordCrmProperties(objectType: string, recordId: string) {
  const parsedObjectType = crmObjectTypeSchema.parse(objectType)
  const parsedRecordId = idSchema.parse(recordId)
  return withAuth(async ({ companyId }) => {
    if (!await recordExists(companyId, parsedObjectType, parsedRecordId)) return null
    const [definitions, history] = await Promise.all([
      prisma.crmPropertyDefinition.findMany({
        where: { companyId, objectType: parsedObjectType, archivedAt: null },
        include: { values: { where: { recordId: parsedRecordId }, take: 1 } },
        orderBy: [{ groupName: "asc" }, { position: "asc" }, { label: "asc" }],
      }),
      prisma.crmPropertyHistory.findMany({
        where: { companyId, objectType: parsedObjectType, recordId: parsedRecordId },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ])
    const userIds = [...new Set(history.map((entry) => entry.changedById))]
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : []
    const userNames = new Map(users.map((user) => [user.id, user.name || user.email || "Utilisateur"]))
    return {
      definitions: definitions.map((definition) => ({
        id: definition.id,
        key: definition.key,
        label: definition.label,
        type: definition.type,
        groupName: definition.groupName,
        description: definition.description,
        options: Array.isArray(definition.options) ? definition.options : [],
        required: definition.required,
        value: definition.values[0]?.value ?? null,
      })),
      history: history.map((entry) => ({
        id: entry.id,
        propertyLabel: entry.propertyLabel,
        previousValue: entry.previousValue,
        nextValue: entry.nextValue,
        changedBy: userNames.get(entry.changedById) || "Utilisateur",
        createdAt: entry.createdAt.toISOString(),
      })),
    }
  }, READ_PERMISSIONS[parsedObjectType])
}

export async function updateRecordCrmProperties(input: unknown) {
  const parsed = valuesInputSchema.parse(input)
  return withAuth(async ({ companyId, userId }) => {
    if (!await recordExists(companyId, parsed.objectType, parsed.recordId)) throw new Error("Enregistrement introuvable")
    const definitionIds = Object.keys(parsed.values)
    const definitions = await prisma.crmPropertyDefinition.findMany({
      where: { companyId, objectType: parsed.objectType, archivedAt: null, id: { in: definitionIds } },
    })
    if (definitions.length !== definitionIds.length) throw new Error("Une propriété est invalide ou archivée")

    const existingValues = await prisma.crmPropertyValue.findMany({
      where: { companyId, recordId: parsed.recordId, definitionId: { in: definitionIds } },
    })
    const existingByDefinition = new Map(existingValues.map((value) => [value.definitionId, value]))
    const changes = definitions.flatMap((definition) => {
      const normalized = parseCrmPropertyValue(definition, parsed.values[definition.id])
      const existing = existingByDefinition.get(definition.id)
      const previousSerialized = existing ? JSON.stringify(existing.value) : null
      const nextSerialized = normalized === null ? null : JSON.stringify(normalized)
      return previousSerialized === nextSerialized ? [] : [{ definition, existing, normalized, previousSerialized, nextSerialized }]
    })

    await prisma.$transaction(async (tx) => {
      for (const change of changes) {
        if (change.normalized === null) {
          if (change.existing) await tx.crmPropertyValue.delete({ where: { id: change.existing.id } })
        } else {
          await tx.crmPropertyValue.upsert({
            where: { definitionId_recordId: { definitionId: change.definition.id, recordId: parsed.recordId } },
            create: { companyId, definitionId: change.definition.id, recordId: parsed.recordId, value: change.normalized as Prisma.InputJsonValue, updatedById: userId },
            update: { value: change.normalized as Prisma.InputJsonValue, updatedById: userId },
          })
        }
        await tx.crmPropertyHistory.create({
          data: {
            companyId,
            definitionId: change.definition.id,
            objectType: parsed.objectType,
            recordId: parsed.recordId,
            propertyKey: change.definition.key,
            propertyLabel: change.definition.label,
            previousValue: change.previousSerialized,
            nextValue: change.nextSerialized,
            changedById: userId,
          },
        })
      }
    })
    await logAction({ userId, action: "UPDATE_CRM_PROPERTY_VALUES", resource: parsed.objectType, resourceId: parsed.recordId, payload: { properties: changes.map((change) => change.definition.key) } })
    revalidatePath(`/dashboard/clients/${parsed.recordId}`)
    revalidatePath(`/dashboard/contacts/${parsed.recordId}`)
    revalidatePath(`/dashboard/pipeline/${parsed.recordId}`)
    revalidatePath(`/dashboard/projets/${parsed.recordId}`)
    revalidatePath(`/dashboard/service/tickets/${parsed.recordId}`)
    revalidatePath(`/dashboard/equipements/${parsed.recordId}`)
    return { success: true as const, updated: changes.length }
  }, WRITE_PERMISSIONS[parsed.objectType])
}
