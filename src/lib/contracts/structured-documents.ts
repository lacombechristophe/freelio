export type AmendmentChangeInput = {
  category: string
  label: string
  previousValue?: string | null
  nextValue: string
  financialImpactCents?: number | null
}

type MaintenanceRenewalDocumentInput = {
  sourceNumber: string
  label: string
  siteLabel: string
  nextStartDate: Date
  nextEndDate: Date
  currentPriceCents: number
  nextPriceCents: number
  indexationRate: number
  frequency: string
  noticeDays: number
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

function date(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(value)
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function buildContractAmendmentContent(input: {
  sourceNumber: string
  reason: string
  effectiveAt: Date
  changes: AmendmentChangeInput[]
}) {
  const changes = input.changes.map((change) => {
    const previous = change.previousValue?.trim() || "Non applicable"
    const impact = change.financialImpactCents == null
      ? ""
      : `<p><strong>Impact financier :</strong> ${escapeHtml(money(change.financialImpactCents))}</p>`

    return `<li><p><strong>${escapeHtml(change.category)} · ${escapeHtml(change.label)}</strong></p><p>Avant : ${escapeHtml(previous)}</p><p>Après : ${escapeHtml(change.nextValue)}</p>${impact}</li>`
  }).join("")

  return `<h1>Avenant au contrat ${escapeHtml(input.sourceNumber)}</h1><p><strong>Objet :</strong> ${escapeHtml(input.reason)}</p><p><strong>Date d’effet :</strong> ${escapeHtml(date(input.effectiveAt))}</p><h2>Modifications convenues</h2><ol>${changes}</ol><h2>Maintien des autres stipulations</h2><p>Les stipulations du contrat initial non expressément modifiées par le présent avenant demeurent inchangées et pleinement applicables.</p><h2>Acceptation</h2><p>Le présent avenant entre en vigueur à sa date d’effet après signature électronique des parties concernées.</p>`
}

export function buildMaintenanceRenewalContent(input: MaintenanceRenewalDocumentInput) {
  return `<h1>Proposition de renouvellement</h1><p>La présente proposition renouvelle le contrat d’entretien <strong>${escapeHtml(input.sourceNumber)}</strong> relatif à <strong>${escapeHtml(input.label)}</strong>, sur le site <strong>${escapeHtml(input.siteLabel)}</strong>.</p><h2>Nouveau terme</h2><ul><li>Début : ${escapeHtml(date(input.nextStartDate))}</li><li>Fin : ${escapeHtml(date(input.nextEndDate))}</li><li>Fréquence : ${escapeHtml(input.frequency)}</li><li>Préavis : ${input.noticeDays} jours</li></ul><h2>Conditions financières</h2><p>Tarif actuel : ${escapeHtml(money(input.currentPriceCents))} TTC.</p><p>Nouveau tarif : <strong>${escapeHtml(money(input.nextPriceCents))} TTC</strong>, après indexation de ${escapeHtml(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(input.indexationRate))} %.</p><h2>Acceptation</h2><p>La signature électronique de cette proposition vaut accord sur le nouveau terme et ses conditions. Le nouveau contrat d’entretien sera ensuite créé dans le dossier, sans altérer l’historique du terme précédent.</p>`
}
