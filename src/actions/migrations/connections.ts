"use server"

import { createHash } from "node:crypto"
import { Prisma } from "@/generated/prisma/client"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { withAuth } from "@/lib/auth-wrapper"
import { discoverHubSpot, testHubSpotConnection } from "@/lib/migrations/hubspot"
import { testExtrabatConnection } from "@/lib/migrations/extrabat"
import { migrationDatabase as prisma } from "@/lib/migrations/database"
import { encryptedCredentials, readCredentials, extrabatConfig } from "./credentials"
import { providerSchema, connectionIdSchema } from "./schemas"

const connectionSchema = z.object({
  provider: providerSchema,
  name: z.string().trim().min(2).max(80),
  apiKey: z.string().trim().min(12).max(2_000),
  baseUrl: z.string().url().optional(),
  testPath: z.string().trim().max(300).optional(),
  authHeader: z.string().trim().max(80).optional(),
  authScheme: z.string().trim().max(40).optional(),
})

export async function saveSourceConnection(data: unknown) {
  return withAuth(async ({ companyId }) => {
    const parsed = connectionSchema.safeParse(data)
    if (!parsed.success) return { success: false as const, error: "Paramètres de connexion invalides." }

    const config: Prisma.InputJsonValue = parsed.data.provider === "EXTRABAT"
      ? {
          baseUrl: parsed.data.baseUrl || "https://myextrabat.com",
          testPath: parsed.data.testPath || "/",
          authHeader: parsed.data.authHeader || "Authorization",
          authScheme: parsed.data.authScheme ?? "Bearer",
        }
      : {}

    const connection = await prisma.dataSourceConnection.upsert({
      where: { companyId_provider_name: { companyId, provider: parsed.data.provider, name: parsed.data.name } },
      update: {
        credentialsEncrypted: encryptedCredentials(parsed.data.provider, parsed.data.apiKey),
        config,
        status: "PENDING",
        lastError: null,
      },
      create: {
        companyId,
        provider: parsed.data.provider,
        name: parsed.data.name,
        credentialsEncrypted: encryptedCredentials(parsed.data.provider, parsed.data.apiKey),
        config,
      },
      select: { id: true },
    })
    revalidatePath("/dashboard/migrations")
    return { success: true as const, connectionId: connection.id }
  }, "migration.manage")
}

export async function testSourceConnection(connectionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.safeParse(connectionId)
    if (!parsedId.success) return { success: false as const, error: "Connexion invalide." }
    const connection = await prisma.dataSourceConnection.findFirst({ where: { id: parsedId.data, companyId } })
    if (!connection) return { success: false as const, error: "Connexion introuvable." }

    try {
      const credentials = readCredentials(connection)
      const result = connection.provider === "HUBSPOT"
        ? await testHubSpotConnection((credentials as { accessToken: string }).accessToken)
        : await testExtrabatConnection((credentials as { apiKey: string }).apiKey, extrabatConfig(connection.config))
      await prisma.dataSourceConnection.update({
        where: { id: connection.id },
        data: { status: connection.provider === "HUBSPOT" ? "ACTIVE" : "REACHABLE", lastTestAt: new Date(), lastError: null },
      })
      revalidatePath("/dashboard/migrations")
      return { success: true as const, detail: result }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible"
      await prisma.dataSourceConnection.update({
        where: { id: connection.id },
        data: { status: "ERROR", lastTestAt: new Date(), lastError: message.slice(0, 500) },
      })
      revalidatePath("/dashboard/migrations")
      return { success: false as const, error: message }
    }
  }, "migration.manage")
}

export async function discoverSourceConnection(connectionId: string) {
  return withAuth(async ({ companyId }) => {
    const parsedId = connectionIdSchema.parse(connectionId)
    const connection = await prisma.dataSourceConnection.findFirst({ where: { id: parsedId, companyId } })
    if (!connection) throw new Error("Connexion introuvable")
    if (connection.provider !== "HUBSPOT") {
      return { success: false as const, error: "La découverte Extrabat attend la documentation d'API du compte. Utilisez les exports manuels entre-temps." }
    }

    const run = await prisma.migrationRun.create({
      data: { companyId, connectionId: connection.id, provider: "HUBSPOT", kind: "DISCOVERY", status: "RUNNING", startedAt: new Date() },
    })

    try {
      const { accessToken } = readCredentials(connection) as { accessToken: string }
      const objects = await discoverHubSpot(accessToken)
      await prisma.$transaction(async (tx) => {
        for (const object of objects) {
          const payload = object as unknown as Prisma.InputJsonValue
          await tx.sourceRecord.create({
            data: {
              companyId,
              runId: run.id,
              provider: "HUBSPOT",
              objectType: "HUBSPOT_SCHEMA",
              sourceId: object.objectType,
              payload,
              checksum: createHash("sha256").update(JSON.stringify(object)).digest("hex"),
            },
          })
          await tx.migrationMetric.create({
            data: {
              runId: run.id,
              objectType: object.objectType,
              sourceCount: object.hasRecords ? 1 : 0,
              extracted: object.accessible ? 1 : 0,
              rejected: object.accessible ? 0 : 1,
            },
          })
          if (!object.accessible) {
            await tx.migrationIssue.create({
              data: {
                runId: run.id,
                severity: "WARNING",
                objectType: object.objectType,
                code: "HUBSPOT_SCOPE_OR_OBJECT_UNAVAILABLE",
                message: object.error || "Objet HubSpot inaccessible",
              },
            })
          }
        }
        await tx.migrationRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETE",
            completedAt: new Date(),
            summary: { accessible: objects.filter((object) => object.accessible).length, total: objects.length },
          },
        })
      })
      revalidatePath("/dashboard/migrations")
      return {
        success: true as const,
        runId: run.id,
        objects: objects.map((object) => ({
          objectType: object.objectType,
          accessible: object.accessible,
          propertyCount: object.propertyCount,
          hasRecords: object.hasRecords,
          ...(object.error ? { error: object.error } : {}),
        })),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Découverte impossible"
      await prisma.migrationRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), summary: { error: message } } })
      throw error
    }
  }, "migration.manage")
}
