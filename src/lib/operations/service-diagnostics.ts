export type ServiceDiagnosticStep = {
  id: string
  label: string
  required: boolean
}

export type ServiceDiagnosticGuideRecord = {
  id: string
  name: string
  productCategory?: string | null
  manufacturer?: string | null
  modelPattern?: string | null
  symptom: string
  keywords?: unknown
  steps: unknown
  resolutionHints?: unknown
  warrantyInstructions?: string | null
  outOfWarrantyInstructions?: string | null
  priority?: number
}

export type ServiceDiagnosticTicketContext = {
  title: string
  description?: string | null
  equipment?: {
    category?: string | null
    manufacturer?: string | null
    model?: string | null
  } | null
}

const stopWords = new Set([
  "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "en",
  "et", "la", "le", "les", "pour", "sur", "un", "une",
])

export function normalizeDiagnosticText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function meaningfulTokens(value: string | null | undefined) {
  return new Set(normalizeDiagnosticText(value).split(" ").filter((token) => token.length > 1 && !stopWords.has(token)))
}

function textSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = meaningfulTokens(left)
  const rightTokens = meaningfulTokens(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  return intersection / new Set([...leftTokens, ...rightTokens]).size
}

export function diagnosticStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 50)
}

export function diagnosticSteps(value: unknown): ServiceDiagnosticStep[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const label = typeof record.label === "string" ? record.label.trim() : ""
    if (!label) return []
    return [{
      id: typeof record.id === "string" && record.id.trim() ? record.id.trim() : `step-${index + 1}`,
      label,
      required: record.required !== false,
    }]
  }).slice(0, 30)
}

function fieldMatch(filter: string | null | undefined, value: string | null | undefined) {
  const normalizedFilter = normalizeDiagnosticText(filter)
  const normalizedValue = normalizeDiagnosticText(value)
  if (!normalizedFilter) return true
  return Boolean(normalizedValue && normalizedValue.includes(normalizedFilter))
}

export function scoreDiagnosticGuide(guide: ServiceDiagnosticGuideRecord, ticket: ServiceDiagnosticTicketContext) {
  const equipment = ticket.equipment
  if (!fieldMatch(guide.productCategory, equipment?.category)) return null
  if (!fieldMatch(guide.manufacturer, equipment?.manufacturer)) return null
  if (!fieldMatch(guide.modelPattern, equipment?.model)) return null

  let score = Math.max(0, Math.min(10, guide.priority || 0))
  const reasons: string[] = []
  if (guide.productCategory) { score += 25; reasons.push("gamme compatible") }
  if (guide.manufacturer) { score += 20; reasons.push("fabricant compatible") }
  if (guide.modelPattern) { score += 20; reasons.push("modèle compatible") }

  const requestText = `${ticket.title} ${ticket.description || ""}`
  const keywordMatches = diagnosticStringList(guide.keywords).filter((keyword) => normalizeDiagnosticText(requestText).includes(normalizeDiagnosticText(keyword)))
  if (keywordMatches.length > 0) {
    score += Math.min(30, keywordMatches.length * 10)
    reasons.push(`${keywordMatches.length} mot-clé${keywordMatches.length > 1 ? "s" : ""} reconnu${keywordMatches.length > 1 ? "s" : ""}`)
  }

  const symptomSimilarity = textSimilarity(guide.symptom, requestText)
  if (symptomSimilarity >= 0.5) {
    score += 25
    reasons.push("symptôme très proche")
  } else if (symptomSimilarity >= 0.25) {
    score += 15
    reasons.push("symptôme proche")
  }

  if (score < 20) return null
  return { score: Math.min(100, score), reasons }
}

export function equipmentWarrantyStatus(warrantyUntil: Date | string | null | undefined, now = new Date()) {
  if (!warrantyUntil) return "UNKNOWN" as const
  return new Date(warrantyUntil).getTime() >= now.getTime() ? "COVERED" as const : "EXPIRED" as const
}
