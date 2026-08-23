import type { Line } from "@/components/shared/line-items-editor"

export type BillingLinePreset = {
  id: string
  label: string
  description: string
  bestFor: string
  lines: Line[]
}

export const BILLING_LINE_PRESETS: BillingLinePreset[] = [
  {
    id: "audit-technique",
    label: "Audit technique",
    description: "Diagnostic complet avec restitution exploitable.",
    bestFor: "Avant refonte, reprise de projet, performance, dette technique.",
    lines: [
      {
        label: "Audit technique fullstack",
        description: "Analyse architecture, code, performances, securite, dette technique et priorites.",
        quantity: 1,
        unitPriceCents: 90000,
        tvaRate: 20,
      },
      {
        label: "Restitution et plan d'action",
        description: "Rapport priorise avec recommandations, risques, quick wins et feuille de route.",
        quantity: 1,
        unitPriceCents: 35000,
        tvaRate: 20,
      },
    ],
  },
  {
    id: "refonte-web",
    label: "Refonte web",
    description: "Pack clair pour site vitrine ou site marketing evolue.",
    bestFor: "Landing, site vitrine, refonte front, SEO technique.",
    lines: [
      {
        label: "Cadrage UX et structure des pages",
        description: "Arborescence, parcours, contenus attendus et priorites de conversion.",
        quantity: 1,
        unitPriceCents: 45000,
        tvaRate: 20,
      },
      {
        label: "Design UI et integration responsive",
        description: "Interface desktop/mobile, composants, animations sobres et accessibilite.",
        quantity: 1,
        unitPriceCents: 180000,
        tvaRate: 20,
      },
      {
        label: "Mise en ligne et recette",
        description: "Tests finaux, corrections, configuration domaine et livraison.",
        quantity: 1,
        unitPriceCents: 50000,
        tvaRate: 20,
      },
    ],
  },
  {
    id: "mvp-saas",
    label: "MVP applicatif",
    description: "Base pour une application web ou un outil interne.",
    bestFor: "Dashboard, CRM interne, SaaS MVP, backoffice.",
    lines: [
      {
        label: "Cadrage produit et architecture",
        description: "Specifications, modelisation des donnees, choix techniques et jalons.",
        quantity: 1,
        unitPriceCents: 75000,
        tvaRate: 20,
      },
      {
        label: "Developpement fullstack MVP",
        description: "Interfaces, backend, base de donnees, authentification et workflows principaux.",
        quantity: 1,
        unitPriceCents: 420000,
        tvaRate: 20,
      },
      {
        label: "Deploiement, tests et passation",
        description: "Recette, correction des anomalies, mise en production et documentation courte.",
        quantity: 1,
        unitPriceCents: 90000,
        tvaRate: 20,
      },
    ],
  },
  {
    id: "maintenance-mensuelle",
    label: "Maintenance mensuelle",
    description: "Forfait recurrent pour stabilite et petites evolutions.",
    bestFor: "Client existant, production, support, petites evolutions.",
    lines: [
      {
        label: "Forfait maintenance et support mensuel",
        description: "Correctifs, mises a jour raisonnables, monitoring manuel et conseil technique.",
        quantity: 1,
        unitPriceCents: 75000,
        tvaRate: 20,
      },
    ],
  },
]

