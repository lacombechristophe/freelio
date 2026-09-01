import { z } from "zod"

const reachableEmailSchema = z.string().trim().email()

export type CampaignAudienceLead = {
  id: string
  email: string | null
  marketingOptIn: boolean
  status: string
  contact?: { marketingStatus: string | null } | null
}

export type CampaignAudienceReadiness = {
  total: number
  eligibleIds: string[]
  missingEmail: number
  missingConsent: number
  optedOut: number
  excludedStatus: number
  alreadyEnrolled: number
}

export function evaluateCampaignAudience(
  leads: CampaignAudienceLead[],
  existingEnrollmentLeadIds: Iterable<string> = [],
): CampaignAudienceReadiness {
  const existing = new Set(existingEnrollmentLeadIds)
  const result: CampaignAudienceReadiness = {
    total: leads.length,
    eligibleIds: [],
    missingEmail: 0,
    missingConsent: 0,
    optedOut: 0,
    excludedStatus: 0,
    alreadyEnrolled: 0,
  }

  for (const lead of leads) {
    if (existing.has(lead.id)) {
      result.alreadyEnrolled += 1
      continue
    }
    if (["ARCHIVED", "SPAM"].includes(lead.status)) {
      result.excludedStatus += 1
      continue
    }
    if (!reachableEmailSchema.safeParse(lead.email).success) {
      result.missingEmail += 1
      continue
    }
    if (!lead.marketingOptIn) {
      result.missingConsent += 1
      continue
    }
    if (lead.contact?.marketingStatus === "OPTED_OUT") {
      result.optedOut += 1
      continue
    }
    if (lead.contact?.marketingStatus === "NOT_OPTED_IN") {
      result.missingConsent += 1
      continue
    }
    result.eligibleIds.push(lead.id)
  }

  return result
}
