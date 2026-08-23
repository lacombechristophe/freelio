import type { Metadata } from "next"

import { ComplianceMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Factur-X et conformité 2026",
  description:
    "Préparez vos factures Factur-X, mentions, données structurées, TVA et exports avant la transmission via votre plateforme agréée.",
}

export default function ConformitePage() {
  return <ComplianceMarketingPage />
}
