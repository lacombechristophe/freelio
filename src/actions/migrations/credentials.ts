import { Prisma } from "@/generated/prisma/client"
import { z } from "zod"
import { decrypt, encrypt } from "@/lib/crypto"
import { type ExtrabatConnectionConfig } from "@/lib/migrations/extrabat"

export function encryptedCredentials(provider: "HUBSPOT" | "EXTRABAT", apiKey: string) {
  return encrypt(JSON.stringify(provider === "HUBSPOT" ? { accessToken: apiKey } : { apiKey }))
}

export function readCredentials(connection: { provider: string; credentialsEncrypted: string }) {
  const parsed = JSON.parse(decrypt(connection.credentialsEncrypted)) as Record<string, unknown>
  if (connection.provider === "HUBSPOT" && typeof parsed.accessToken === "string") {
    return { accessToken: parsed.accessToken }
  }
  if (connection.provider === "EXTRABAT" && typeof parsed.apiKey === "string") {
    return { apiKey: parsed.apiKey }
  }
  throw new Error("Identifiants de connexion invalides")
}

export function extrabatConfig(value: Prisma.JsonValue | null): ExtrabatConnectionConfig {
  const parsed = z.object({
    baseUrl: z.string().url(),
    testPath: z.string(),
    authHeader: z.string(),
    authScheme: z.string(),
  }).parse(value)
  return parsed
}
