import { describe, expect, it } from "vitest"

import { evaluateCampaignAudience } from "@/lib/marketing/campaign-audience"

describe("campaign audience readiness", () => {
  it("keeps only consented, reachable and non-opposed leads", () => {
    const result = evaluateCampaignAudience([
      { id: "eligible", email: "client@example.com", marketingOptIn: true, status: "NEW", contact: { marketingStatus: "OPTED_IN" } },
      { id: "missing-email", email: null, marketingOptIn: true, status: "NEW" },
      { id: "invalid-email", email: "adresse-invalide", marketingOptIn: true, status: "NEW" },
      { id: "no-consent", email: "consent@example.com", marketingOptIn: false, status: "NEW" },
      { id: "contact-no-consent", email: "contact@example.com", marketingOptIn: true, status: "NEW", contact: { marketingStatus: "NOT_OPTED_IN" } },
      { id: "opposed", email: "opposed@example.com", marketingOptIn: true, status: "NEW", contact: { marketingStatus: "OPTED_OUT" } },
      { id: "spam", email: "spam@example.com", marketingOptIn: true, status: "SPAM" },
      { id: "existing", email: "existing@example.com", marketingOptIn: true, status: "NEW" },
      { id: "suppressed", email: "BLOCKED@example.com", marketingOptIn: true, status: "NEW" },
    ], ["existing"], ["blocked@example.com"])

    expect(result).toEqual({
      total: 9,
      eligibleIds: ["eligible"],
      missingEmail: 2,
      missingConsent: 2,
      optedOut: 1,
      excludedStatus: 1,
      alreadyEnrolled: 1,
      suppressed: 1,
    })
  })
})
