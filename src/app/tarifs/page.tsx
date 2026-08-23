import type { Metadata } from "next"

import { PricingMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Tarifs - Alpha gratuite et offres Solo",
  description:
    "Comparez les offres Freelio pour indépendants : alpha gratuite, offre Solo et formule Studio, sans frais cachés.",
}

export default function TarifsPage() {
  return <PricingMarketingPage />
}
