export const leadStatusLabels: Record<string, string> = {
  NEW: "Nouveau", CONTACTED: "Contacté", QUALIFIED: "Qualifié", CONVERTED: "Converti", SPAM: "Indésirable",
}

export const leadSourceLabels: Record<string, string> = {
  WEBSITE: "Site web", MANUAL: "Saisie manuelle", IMPORT: "Import", FORM: "Formulaire",
  HUBSPOT: "HubSpot", EXTRABAT: "Extrabat", REFERRAL: "Recommandation",
}

export const scoringFieldLabels: Record<string, string> = {
  status: "Statut", source: "Source", city: "Ville", projectType: "Type de projet",
  marketingOptIn: "Consentement marketing", email: "E-mail", phone: "Téléphone",
}

export const scoringOperatorLabels: Record<string, string> = {
  EQUALS: "est égal à", NOT_EQUALS: "est différent de", CONTAINS: "contient", EXISTS: "est renseigné",
}

const filterLabels: Record<string, string> = {
  ...scoringFieldLabels, cityContains: "Ville contient", projectTypeContains: "Projet contient",
  minScore: "Score minimum", maxScore: "Score maximum", createdWithinDays: "Créé depuis (jours)",
}

export function marketingObjectStatusLabel(status: string) {
  return ({ ACTIVE: "Actif", ARCHIVED: "Archivé", PAUSED: "En pause" } as Record<string, string>)[status] ?? "État historique"
}

export function marketingValueLabel(field: string, value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return "Valeur historique"
  if (field === "marketingOptIn") return value === true || value === "true" ? "Accepté" : value === false || value === "false" ? "Refusé" : String(value)
  const text = String(value)
  if (field === "status") return leadStatusLabels[text.toUpperCase()] ?? text
  if (field === "source") return leadSourceLabels[text.toUpperCase()] ?? text
  return text
}

export function segmentFilterLabel(field: string, value: unknown) {
  return `${filterLabels[field] ?? "Critère historique"} : ${marketingValueLabel(field, value)}`
}

/** Translate an exact display label only; custom sources and partial rules stay intact. */
export function scoringStoredValue(field: string, value: string) {
  const labels = field === "status" ? leadStatusLabels : field === "source" ? leadSourceLabels : null
  const normalized = value.trim().toLocaleLowerCase("fr")
  return labels ? Object.entries(labels).find(([, label]) => label.toLocaleLowerCase("fr") === normalized)?.[0] ?? value : value
}
