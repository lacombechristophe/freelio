import type { PdfDocument } from "@/lib/pdf/render"

export type DocumentQualitySeverity = "error" | "warning" | "info"

export type DocumentQualityIssue = {
  id: string
  severity: DocumentQualitySeverity
  title: string
  detail: string
  fix?: string
}

export type DocumentQualityReport = {
  score: number
  status: "READY" | "TO_REVIEW" | "BLOCKED"
  label: string
  summary: string
  issues: DocumentQualityIssue[]
}

type ContractQualityInput = {
  title: string
  content: string
  validFrom?: Date | string | null
  validUntil?: Date | string | null
  client: {
    name: string
    address?: string | null
    email?: string | null
  }
  company?: {
    name?: string | null
    siret?: string | null
    address?: string | null
  } | null
}

function stripTags(value: string) {
  return value.replace(/<[^>]+>/g, " ")
}

function normalizeText(value: string) {
  return stripTags(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function hasText(value: string | null | undefined) {
  return !!value && value.trim().length > 0
}

function pushIssue(
  issues: DocumentQualityIssue[],
  severity: DocumentQualitySeverity,
  id: string,
  title: string,
  detail: string,
  fix?: string
) {
  issues.push({ id, severity, title, detail, fix })
}

function issuePenalty(issue: DocumentQualityIssue) {
  if (issue.severity === "error") return 18
  if (issue.severity === "warning") return 7
  return 3
}

function buildReport(issues: DocumentQualityIssue[], readyLabel: string): DocumentQualityReport {
  const score = Math.max(0, 100 - issues.reduce((total, issue) => total + issuePenalty(issue), 0))
  const errors = issues.filter((issue) => issue.severity === "error").length
  const warnings = issues.filter((issue) => issue.severity === "warning").length
  const status = errors > 0 ? "BLOCKED" : score >= 86 ? "READY" : "TO_REVIEW"
  const label = status === "READY" ? readyLabel : status === "BLOCKED" ? "A corriger" : "A relire"
  const summary =
    status === "READY"
      ? "Le document est complet pour un usage professionnel courant."
      : `${errors} erreur(s), ${warnings} point(s) de vigilance.`

  return { score, status, label, summary, issues }
}

function hasCoherentTotals(doc: PdfDocument) {
  const computedHt = doc.lines.reduce(
    (total, line) => total + Math.round(line.quantity * line.unitPriceCents),
    0
  )
  const computedTva = doc.lines.reduce((total, line) => {
    const lineHt = Math.round(line.quantity * line.unitPriceCents)
    return total + Math.round((lineHt * line.tvaRate) / 100)
  }, 0)

  return (
    Math.abs(computedHt - doc.totalHtCents) <= 1 &&
    Math.abs(computedTva - doc.totalTvaCents) <= 1 &&
    Math.abs(computedHt + computedTva - doc.totalTtcCents) <= 1
  )
}

export function assessBillingDocumentQuality(doc: PdfDocument): DocumentQualityReport {
  const issues: DocumentQualityIssue[] = []
  const isInvoice = doc.kind === "FACTURE"
  const dueDate = isInvoice ? doc.dueDate : doc.validUntil

  if (!hasText(doc.number)) {
    pushIssue(issues, "error", "missing-number", "Numero manquant", "Le document doit avoir un numero unique.")
  }
  if (!hasText(doc.object)) {
    pushIssue(issues, "error", "missing-object", "Objet manquant", "L'objet permet au client de rattacher le document a la mission.")
  }
  if (!doc.lines.length) {
    pushIssue(issues, "error", "missing-lines", "Aucune ligne", "Ajoutez au moins une prestation ou un livrable.")
  }
  if (doc.lines.some((line) => !hasText(line.label))) {
    pushIssue(issues, "error", "empty-line-label", "Libelle incomplet", "Chaque ligne doit avoir un libelle lisible.")
  }
  if (doc.lines.some((line) => line.quantity <= 0)) {
    pushIssue(issues, "error", "invalid-quantity", "Quantite invalide", "Les quantites doivent etre strictement positives.")
  }
  if (!hasCoherentTotals(doc)) {
    pushIssue(issues, "error", "invalid-totals", "Totaux incoherents", "Les totaux affiches ne correspondent pas aux lignes.")
  }

  if (!hasText(doc.company.name)) {
    pushIssue(issues, "error", "missing-company-name", "Identite emetteur incomplete", "Renseignez le nom de votre structure.")
  }
  if (!hasText(doc.company.address)) {
    pushIssue(issues, "warning", "missing-company-address", "Adresse emetteur absente", "L'adresse de l'emetteur renforce la conformite et la credibilite.")
  }
  if (!hasText(doc.company.siret)) {
    pushIssue(issues, "warning", "missing-company-siret", "SIRET emetteur absent", "Renseignez votre SIRET dans les parametres.")
  }
  if (doc.company.isTvaApplicable && !hasText(doc.company.tvaNumber)) {
    pushIssue(issues, "warning", "missing-company-vat", "Numero TVA absent", "Ajoutez votre numero de TVA si vous facturez la TVA.")
  }
  if (isInvoice && !hasText(doc.company.iban)) {
    pushIssue(issues, "info", "missing-iban", "IBAN non renseigne", "Ajoutez l'IBAN pour faciliter les virements.")
  }

  if (!hasText(doc.client.name)) {
    pushIssue(issues, "error", "missing-client-name", "Client absent", "Selectionnez un client.")
  }
  if (!hasText(doc.client.address)) {
    pushIssue(issues, "warning", "missing-client-address", "Adresse client absente", "L'adresse client rend le document plus solide.")
  }
  if (isInvoice && !hasText(doc.client.siret)) {
    pushIssue(issues, "info", "missing-client-siret", "SIRET client absent", "Utile pour les clients B2B et la facturation electronique.")
  }

  if (!doc.date) {
    pushIssue(issues, "error", "missing-date", "Date manquante", "Le document doit etre date.")
  }
  if (!dueDate) {
    pushIssue(
      issues,
      isInvoice ? "error" : "warning",
      "missing-due-date",
      isInvoice ? "Echeance manquante" : "Validite non definie",
      isInvoice ? "Renseignez une date d'echeance." : "Ajoutez une date de fin de validite au devis."
    )
  }
  if (doc.company.isTvaApplicable === false && doc.lines.some((line) => line.tvaRate !== 0)) {
    pushIssue(issues, "error", "vat-franchise-mismatch", "TVA incoherente", "Une structure en franchise de TVA doit avoir des lignes a 0%.")
  }
  if (doc.totalTtcCents === 0) {
    pushIssue(issues, "warning", "zero-total", "Montant nul", "Verifiez que le document n'est pas une erreur de saisie.")
  }

  return buildReport(issues, "Pret a envoyer")
}

const CONTRACT_EXPECTATIONS: Array<{ id: string; label: string; terms: string[] }> = [
  { id: "scope", label: "Perimetre", terms: ["perimetre", "mission", "livrable", "objet"] },
  { id: "payment", label: "Prix et paiement", terms: ["prix", "facturation", "paiement", "retard"] },
  { id: "acceptance", label: "Recette et validation", terms: ["recette", "validation", "accepte", "livrable"] },
  { id: "ip", label: "Propriete intellectuelle", terms: ["propriete intellectuelle", "droits", "cession"] },
  { id: "liability", label: "Responsabilite", terms: ["responsabilite", "dommages", "limite"] },
  { id: "confidentiality", label: "Confidentialite", terms: ["confidentialite", "informations confidentielles"] },
]

export function assessContractQuality(contract: ContractQualityInput): DocumentQualityReport {
  const issues: DocumentQualityIssue[] = []
  const normalized = normalizeText(contract.content)

  if (!hasText(contract.title)) {
    pushIssue(issues, "error", "missing-title", "Titre absent", "Le contrat doit avoir un titre juridique clair.")
  }
  if (!hasText(contract.client.name)) {
    pushIssue(issues, "error", "missing-client", "Client absent", "Selectionnez le client signataire.")
  }
  if (!hasText(contract.company?.name)) {
    pushIssue(issues, "warning", "missing-company", "Votre identite est incomplete", "Renseignez les informations de votre structure.")
  }
  if (!hasText(contract.company?.siret)) {
    pushIssue(issues, "warning", "missing-company-siret", "SIRET absent", "Ajoutez votre SIRET dans les parametres.")
  }
  if (stripTags(contract.content).trim().length < 900) {
    pushIssue(issues, "warning", "short-contract", "Contrat tres court", "Un contrat de prestation devrait cadrer perimetre, prix, recette, droits et responsabilite.")
  }
  if (!contract.validFrom) {
    pushIssue(issues, "info", "missing-valid-from", "Date d'effet absente", "Ajoutez une date d'effet pour faciliter l'archivage.")
  }

  for (const expectation of CONTRACT_EXPECTATIONS) {
    if (!expectation.terms.some((term) => normalized.includes(term))) {
      pushIssue(
        issues,
        "warning",
        `missing-${expectation.id}`,
        `${expectation.label} non identifiable`,
        `Ajoutez ou adaptez une clause sur : ${expectation.label.toLowerCase()}.`
      )
    }
  }

  if (!normalized.includes("signature")) {
    pushIssue(issues, "info", "missing-signature", "Signature peu explicite", "Ajoutez une section de signature ou de signature electronique.")
  }

  return buildReport(issues, "Pret pour signature")
}

