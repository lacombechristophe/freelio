import type { Metadata } from "next"

import { FaqMarketingPage } from "@/components/marketing/marketing"

export const metadata: Metadata = {
  title: "Questions fréquentes",
  description:
    "Réponses claires sur Freelio, l’alpha, Factur-X, la facturation électronique, les exports et la sécurité des données.",
}

export default function FaqPage() {
  return <FaqMarketingPage />
}
