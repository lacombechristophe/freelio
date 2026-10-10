import "server-only"
import { createHash } from "node:crypto"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { createManualMarketingWithdrawalToken, type ManualMarketingWithdrawalToken } from "@/lib/leads/consent-token"
import { EmailPurposeError } from "./email-purpose"

const normalizedAddress = (value: string) => value.trim().toLowerCase()
const digest = (value: string) => createHash("sha256").update(value).digest("hex")
export const marketingAuthorizationSchema = z.object({ consentId: z.string().cuid(), proofHash: z.string().regex(/^[a-f0-9]{64}$/), addressHash: z.string().regex(/^[a-f0-9]{64}$/) })
export type MarketingAuthorization = z.infer<typeof marketingAuthorizationSchema>

export async function assertManualMarketingConsent(companyId: string, contactId: string, to: string, frozen?: MarketingAuthorization, database: TransactionClient = prisma) {
  const email = normalizedAddress(to)
  const [contact, consent] = await Promise.all([
    database.contact.findFirst({ where: { id: contactId, client: { companyId } }, select: { email: true, marketingStatus: true } }),
    database.marketingConsent.findFirst({ where: { companyId, recipientEmail: email, channel: "EMAIL", purpose: "MARKETING" }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }],
      select: { id: true, contactId: true, proofHash: true, status: true, withdrawnAt: true, capturedAt: true, source: true, legalBasis: true, noticeUrl: true } }),
  ])
  if (!contact || normalizedAddress(contact.email || "") !== email || contact.marketingStatus === "OPTED_OUT" || !consent || consent.contactId !== contactId || consent.status !== "GRANTED" || consent.withdrawnAt || consent.legalBasis !== "CONSENT" || !consent.source.trim() || !consent.noticeUrl || !/^[a-f0-9]{64}$/.test(consent.proofHash)) {
    throw new EmailPurposeError("Prospection refusée : aucune preuve de consentement active pour cette adresse et cette société")
  }
  // A withdrawal/decline wins even when two events share a millisecond.
  if (await database.marketingConsent.count({ where: { companyId, recipientEmail: email, channel: "EMAIL", purpose: "MARKETING", status: { not: "GRANTED" }, capturedAt: { gte: consent.capturedAt } } })) {
    throw new EmailPurposeError("Prospection refusée : consentement retiré ou non confirmé pour cette adresse")
  }
  const authorization = { consentId: consent.id, proofHash: consent.proofHash, addressHash: digest(email) }
  if (frozen && (frozen.consentId !== authorization.consentId || frozen.proofHash !== authorization.proofHash || frozen.addressHash !== authorization.addressHash)) throw new EmailPurposeError("La preuve de consentement a changé depuis la préparation ; créez un nouvel envoi")
  return authorization
}

export async function prepareManualMarketingContent(companyId: string, contactId: string, to: string, html: string) {
  const authorization = await assertManualMarketingConsent(companyId, contactId, to)
  const configured = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL
  if (!configured && process.env.NODE_ENV === "production") throw new EmailPurposeError("PUBLIC_APP_URL est requis pour le lien de retrait")
  const base = new URL(configured || "http://localhost:3000")
  const isolatedLoopback = process.env.RECIPE_ISOLATED === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || (process.env.NODE_ENV === "production" && base.protocol !== "https:" && !isolatedLoopback)) throw new EmailPurposeError("L’URL du lien de retrait doit utiliser HTTPS")
  const token = await createManualMarketingWithdrawalToken({ companyId, consentId: authorization.consentId, addressHash: authorization.addressHash })
  const url = new URL(`/consent/withdraw/${token}`, base).href
  const oneClickUrl = new URL(`/api/public/consent/one-click/${token}`, base).href
  const footer = `<hr><p>Vous recevez cet e-mail de prospection selon votre consentement. <a href="${url}">Se désinscrire</a>.</p>`
  const renderedHtml = html.endsWith("</body></html>") ? html.replace(/<\/body><\/html>$/, `${footer}</body></html>`) : `${html}${footer}`
  return { authorization, renderedHtml, headers: { "List-Unsubscribe": `<${oneClickUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
}

export async function withdrawManualMarketingConsent(payload: ManualMarketingWithdrawalToken, evidence: { tokenHash: string; ipHash: string; userAgentHash: string }) {
  assertDemoMutationAllowed()
  const proof = await prisma.marketingConsent.findFirst({ where: { companyId: payload.companyId, id: payload.consentId, channel: "EMAIL", purpose: "MARKETING", status: "GRANTED" }, select: { recipientEmail: true } })
  if (!proof?.recipientEmail || digest(proof.recipientEmail) !== payload.addressHash) return false
  const recipientEmail = proof.recipientEmail
  return prisma.$transaction(async tx => {
    const latest = await tx.marketingConsent.findFirst({ where: { companyId: payload.companyId, recipientEmail, channel: "EMAIL", purpose: "MARKETING" }, orderBy: [{ capturedAt: "desc" }, { id: "desc" }] })
    if (!latest || latest.status !== "GRANTED" || latest.withdrawnAt) return false
    const capturedAt = new Date(Math.max(Date.now(), latest.capturedAt.getTime() + 1))
    const claimed = await tx.marketingConsent.updateMany({ where: { id: latest.id, companyId: payload.companyId, withdrawnAt: null }, data: { withdrawnAt: capturedAt } })
    if (!claimed.count) return false
    await tx.marketingConsent.create({ data: { companyId: payload.companyId, clientId: latest.clientId, contactId: latest.contactId, leadCaptureId: latest.leadCaptureId,
      recipientEmail, channel: "EMAIL", purpose: "MARKETING", status: "WITHDRAWN", legalBasis: "CONSENT", source: "EMAIL_MARKETING_WITHDRAWAL", capturedAt, withdrawnAt: capturedAt,
      proofHash: digest(JSON.stringify({ companyId: payload.companyId, consentId: latest.id, recipientEmail, status: "WITHDRAWN", capturedAt: capturedAt.toISOString(), ...evidence })), metadata: evidence } })
    if (latest.contactId) {
      const contact = await tx.contact.findFirst({ where: { id: latest.contactId, client: { companyId: payload.companyId } }, select: { email: true } })
      if (contact?.email && normalizedAddress(contact.email) === recipientEmail) await tx.contact.updateMany({ where: { id: latest.contactId, email: contact.email, client: { companyId: payload.companyId } }, data: { marketingStatus: "OPTED_OUT" } })
    }
    await tx.leadCapture.updateMany({ where: { companyId: payload.companyId, email: recipientEmail, marketingOptIn: true }, data: { marketingOptIn: false } })
    await tx.emailSequenceEnrollment.updateMany({ where: { status: "ACTIVE", sequence: { companyId: payload.companyId }, leadCapture: { companyId: payload.companyId, email: recipientEmail } }, data: { status: "STOPPED", stopReason: "CONSENT_WITHDRAWN", nextSendAt: null, completedAt: capturedAt } })
    return true
  })
}
