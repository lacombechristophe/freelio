import type { Line } from "@/components/shared/line-items-editor"

export type BillingLinePreset = {
  id: string
  label: string
  description: string
  bestFor: string
  lines: Line[]
}

const unpricedLine = (label: string, description: string): Line => ({
  label,
  description,
  quantity: 1,
  unitPriceCents: 0,
  tvaRate: 20,
})

/**
 * Prices and reduced VAT rates are deliberately never guessed here. Catalogue
 * pricing and the customer's tax situation must remain the source of truth.
 */
export const BILLING_LINE_PRESETS: BillingLinePreset[] = [
  {
    id: "fourniture-pose-equipement",
    label: "Fourniture & pose",
    description: "Une trame complète de la visite technique à la mise en service.",
    bestFor: "Couverture, volet, abri, pompe, traitement ou équipement de sécurité.",
    lines: [
      unpricedLine("Relevé technique et validation d’implantation", "Contrôle des dimensions, accès, supports, alimentations et contraintes du site."),
      unpricedLine("Fourniture de l’équipement", "Référence, dimensions, finition, options et accessoires selon la configuration validée."),
      unpricedLine("Préparation et pose", "Acheminement, préparation des supports, installation, fixations et raccordements prévus."),
      unpricedLine("Réglages, essais et mise en service", "Contrôles fonctionnels, consignes d’utilisation et réception avec le client."),
    ],
  },
  {
    id: "renovation-bassin",
    label: "Rénovation de bassin",
    description: "Sépare clairement diagnostic, dépose, travaux et remise en eau.",
    bestFor: "Revêtement, filtration, pièces à sceller ou rénovation technique coordonnée.",
    lines: [
      unpricedLine("Diagnostic et préparation du chantier", "État des lieux, relevés, protection de la zone et validation du périmètre."),
      unpricedLine("Dépose et évacuation", "Dépose des éléments prévus et évacuation des déchets selon les conditions du devis."),
      unpricedLine("Travaux de rénovation", "Préparation des supports, fourniture et mise en œuvre des éléments définis."),
      unpricedLine("Remise en service et réception", "Contrôles, nettoyage de fin de chantier, remise en eau si prévue et procès-verbal de réception."),
    ],
  },
  {
    id: "entretien-saisonnier",
    label: "Entretien saisonnier",
    description: "Un cadre lisible pour les opérations récurrentes du bassin.",
    bestFor: "Mise en route, visites périodiques, consommables et hivernage.",
    lines: [
      unpricedLine("Mise en service saisonnière", "Remise en route, contrôles visuels et fonctionnels, réglages initiaux."),
      unpricedLine("Visites d’entretien planifiées", "Contrôles, nettoyage et réglages prévus au contrat, hors réparations et pièces."),
      unpricedLine("Produits et consommables", "Fournitures utilisées ou laissées au client selon quantités réellement prévues."),
      unpricedLine("Hivernage", "Préparation des équipements et du bassin selon la méthode convenue."),
    ],
  },
  {
    id: "intervention-sav",
    label: "Intervention SAV",
    description: "Distingue le diagnostic, le temps passé et les pièces remplacées.",
    bestFor: "Dépannage, remise en service ou intervention hors garantie.",
    lines: [
      unpricedLine("Déplacement et diagnostic", "Déplacement sur site, contrôles et identification de la cause probable."),
      unpricedLine("Main-d’œuvre d’intervention", "Temps d’intervention estimé, démontage, réparation et remontage prévus."),
      unpricedLine("Pièces et consommables", "Références et quantités à confirmer avant remplacement."),
      unpricedLine("Essais et compte rendu", "Tests de fonctionnement, observations, réserves et recommandations au client."),
    ],
  },
]
