import type { Metadata } from "next"

import { FeaturesMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Fonctionnalités - Le CRM métier des piscinistes",
  description:
    "Découvrez comment Freelio relie prospects, devis, chantiers, stocks, interventions, entretien, factures et paiements.",
}

export default function FonctionnalitesPage() {
  return <FeaturesMarketingPage />
}
