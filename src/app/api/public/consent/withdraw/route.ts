import { createHash } from "node:crypto"
import { z } from "zod"

import { verifyConsentWithdrawalToken } from "@/lib/leads/consent-token"
import prisma from "@/lib/prisma"
import { consentRateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"

const requestSchema = z.object({ token: z.string().min(32).max(4096) }).strict()

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
}

function responseHeaders() {
  return new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex, nofollow",
  })
}

export async function POST(request: Request) {
  const headers = responseHeaders()
  const contentLength = Number(request.headers.get("content-length") || "0")
  if (contentLength > 8 * 1024) {
    return Response.json({ error: "Requête trop volumineuse." }, { status: 413, headers })
  }

  try {
    const { token } = requestSchema.parse(await request.json())
    const tokenHash = digest(token)
    const ipHash = digest(clientAddress(request))
    const rateLimit = await consentRateLimit.limit(`${tokenHash}:${ipHash}`)
    headers.set("X-RateLimit-Limit", String(rateLimit.limit))
    headers.set("X-RateLimit-Remaining", String(rateLimit.remaining))
    if (!rateLimit.success) {
      headers.set("Retry-After", String(Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1_000))))
      return Response.json({ error: "Trop de tentatives. Réessayez plus tard." }, { status: 429, headers })
    }

    const payload = await verifyConsentWithdrawalToken(token)
    if (!payload) return Response.json({ error: "Lien invalide." }, { status: 400, headers })

    const lead = await prisma.leadCapture.findFirst({
      where: { id: payload.leadId, companyId: payload.companyId },
      select: { id: true, companyId: true, clientId: true, contactId: true, marketingOptIn: true },
    })

    // Do not disclose whether a former lead still exists. A valid signed link can
    // always be answered successfully and remains safe to replay.
    if (!lead) return Response.json({ success: true, alreadyWithdrawn: true }, { headers })

    const capturedAt = new Date()
    const userAgentHash = digest(request.headers.get("user-agent") || "unknown")
    const proofHash = digest(JSON.stringify({
      companyId: lead.companyId,
      leadId: lead.id,
      status: "WITHDRAWN",
      capturedAt: capturedAt.toISOString(),
      tokenHash,
      ipHash,
      userAgentHash,
    }))

    const withdrawn = await prisma.$transaction(async (tx) => {
      const updated = await tx.leadCapture.updateMany({
        where: { id: lead.id, companyId: lead.companyId, marketingOptIn: true },
        data: { marketingOptIn: false },
      })

      if (lead.contactId) {
        await tx.contact.updateMany({
          where: { id: lead.contactId, client: { companyId: lead.companyId } },
          data: { marketingStatus: "OPTED_OUT" },
        })
      }

      await tx.emailSequenceEnrollment.updateMany({
        where: { leadCaptureId: lead.id, status: "ACTIVE", sequence: { companyId: lead.companyId } },
        data: { status: "STOPPED", stopReason: "CONSENT_WITHDRAWN", nextSendAt: null, completedAt: capturedAt },
      })

      if (updated.count === 0) return false

      await tx.marketingConsent.create({
        data: {
          companyId: lead.companyId,
          clientId: lead.clientId,
          contactId: lead.contactId,
          leadCaptureId: lead.id,
          channel: "EMAIL",
          purpose: "MARKETING",
          status: "WITHDRAWN",
          legalBasis: "CONSENT",
          source: "PUBLIC_WITHDRAWAL_LINK",
          proofHash,
          capturedAt,
          withdrawnAt: capturedAt,
          metadata: { tokenHash, ipHash, userAgentHash },
        },
      })
      return true
    })

    return Response.json({ success: true, alreadyWithdrawn: !withdrawn }, { headers })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Lien invalide." }, { status: 400, headers })
    }
    console.error("Marketing consent withdrawal failed", error)
    return Response.json({ error: "Service temporairement indisponible." }, { status: 500, headers })
  }
}
