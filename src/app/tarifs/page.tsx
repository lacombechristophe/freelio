import type { Metadata } from "next"

import { PricingMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Tarifs - CRM pour piscinistes",
  description:
    "Comparez les offres Freelio pour entreprises de piscine : alpha gratuite, équipe et multi-agences, sans frais cachés.",
}

export default function TarifsPage() {
  return <PricingMarketingPage />
}
