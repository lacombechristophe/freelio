import type { Metadata } from "next"

import { MarketingHome } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Freelio - Tout votre business freelance, enfin relié",
  description:
    "Clients, missions, documents, factures Factur-X et trésorerie avancent ensemble, du premier devis au dernier paiement.",
}

export default function Home() {
  return <MarketingHome />
}
