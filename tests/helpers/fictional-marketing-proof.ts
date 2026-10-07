import { createHash } from "node:crypto"
import prisma from "@/lib/prisma"

/** Explicit recipe evidence only; never a backfill of a real historical opt-in. */
export async function fictionalMarketingProof(companyId: string, leadId: string, email: string) {
  const client = await prisma.client.create({ data: { companyId, name: "Fictional consent recipient" } })
  const contact = await prisma.contact.create({ data: { clientId: client.id, firstName: "Fiction", lastName: "Recipe", email, marketingStatus: "OPTED_IN" } })
  await prisma.leadCapture.update({ where: { id: leadId }, data: { contactId: contact.id, clientId: client.id } })
  const consent = await prisma.marketingConsent.create({ data: { companyId, clientId: client.id, contactId: contact.id, leadCaptureId: leadId, recipientEmail: email.trim().toLowerCase(),
    channel: "EMAIL", purpose: "MARKETING", status: "GRANTED", legalBasis: "CONSENT", source: "ISOLATED_FICTIONAL_RECIPE", noticeUrl: "https://example.test/privacy", proofHash: createHash("sha256").update(`fictional-evidence:${leadId}`).digest("hex") } })
  return { contact, consent, authorization: { consentId: consent.id, proofHash: consent.proofHash, addressHash: createHash("sha256").update(email.trim().toLowerCase()).digest("hex") } }
}
