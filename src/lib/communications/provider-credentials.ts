import "server-only"

import { z } from "zod"

import { decrypt } from "@/lib/crypto"
import prisma from "@/lib/prisma"

const resendCredentialsSchema = z.object({
  mode: z.literal("BYOK"),
  apiKey: z.string().min(8),
  webhookSecret: z.string().min(8),
})

export type ResendTransport = {
  apiKey: string
  webhookSecret: string | null
  fromAddress: string
  displayName: string | null
  channelId: string | null
  mode: "BYOK" | "PLATFORM"
}

export function readResendCredentials(value: string | null | undefined) {
  if (!value) return null
  try {
    return resendCredentialsSchema.parse(JSON.parse(decrypt(value)))
  } catch {
    return null
  }
}

function environmentFromAddress() {
  const configured = process.env.EMAIL_FROM?.trim() || ""
  return (configured.match(/<([^>]+)>/)?.[1] || configured).trim().toLowerCase()
}

export function formatMailboxSender(displayName: string, address: string) {
  const safeName = displayName.replace(/[<>\r\n]/g, "").trim()
  const safeAddress = address.replace(/[<>\r\n]/g, "").trim().toLowerCase()
  if (!safeAddress) throw new Error("Adresse d’envoi non configurée")
  return safeName ? `${safeName} <${safeAddress}>` : safeAddress
}

export async function getResendTransport(companyId: string, channelId?: string | null): Promise<ResendTransport> {
  const channel = await prisma.communicationChannel.findFirst({
    where: { companyId, provider: "RESEND", status: "ACTIVE", ...(channelId ? { id: channelId } : {}) },
    select: { id: true, emailAddress: true, displayName: true, credentialsEncrypted: true },
    orderBy: { updatedAt: "desc" },
  })
  const stored = readResendCredentials(channel?.credentialsEncrypted)
  if (channel && stored) {
    return { apiKey: stored.apiKey, webhookSecret: stored.webhookSecret, fromAddress: channel.emailAddress, displayName: channel.displayName, channelId: channel.id, mode: "BYOK" }
  }
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) throw new Error("Connectez Resend ou configurez RESEND_API_KEY")
  const fromAddress = channel?.emailAddress || environmentFromAddress()
  if (!fromAddress) throw new Error("Adresse d’envoi non configurée")
  return {
    apiKey,
    webhookSecret: process.env.RESEND_WEBHOOK_SECRET?.trim() || null,
    fromAddress,
    displayName: channel?.displayName || null,
    channelId: channel?.id || null,
    mode: "PLATFORM",
  }
}
