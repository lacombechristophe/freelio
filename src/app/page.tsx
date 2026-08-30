import type { Metadata } from "next"

import { MarketingHome } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Freelio - CRM & ERP pour piscinistes",
  description:
    "Prospects, devis, chantiers, stocks, SAV, contrats d’entretien et facturation réunis dans un CRM conçu pour les piscinistes.",
}

export default function Home() {
  return <MarketingHome />
}
