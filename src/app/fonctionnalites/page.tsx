import type { Metadata } from "next"

import { FeaturesMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Fonctionnalités - Un flux relié du devis au paiement",
  description:
    "Découvrez comment Freelio relie clients, devis, contrats, projets, temps, factures Factur-X, relances et paiements.",
}

export default function FonctionnalitesPage() {
  return <FeaturesMarketingPage />
}
