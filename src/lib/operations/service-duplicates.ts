export type ServiceDuplicateRecord = {
  id: string
  clientId: string
  siteId?: string | null
  equipmentId?: string | null
  title: string
  description?: string | null
  type?: string | null
  requestedAt: Date | string
}

export type ServiceDuplicateScore = {
  score: number
  confidence: "FORTE" | "PROBABLE" | "À_VÉRIFIER"
  reasons: string[]
}

const stopWords = new Set([
  "a", "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "en",
  "et", "la", "le", "les", "ma", "mon", "pour", "sur", "un", "une",
])

export function normalizeServiceDuplicateText(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function tokens(value: string | null | undefined) {
  return new Set(
    normalizeServiceDuplicateText(value)
      .split(" ")
      .filter((token) => token.length > 1 && !stopWords.has(token)),
  )
}

export function serviceTextSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const leftTokens = tokens(left)
  const rightTokens = tokens(right)
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return intersection / union
}

export function scoreServiceDuplicate(left: ServiceDuplicateRecord, right: ServiceDuplicateRecord): ServiceDuplicateScore | null {
  if (left.id === right.id || left.clientId !== right.clientId) return null

  let score = 0
  const reasons: string[] = []
  const leftTitle = normalizeServiceDuplicateText(left.title)
  const rightTitle = normalizeServiceDuplicateText(right.title)

  if (left.equipmentId && left.equipmentId === right.equipmentId) {
    score += 45
    reasons.push("même équipement")
  }
  if (left.siteId && left.siteId === right.siteId) {
    score += 15
    reasons.push("même site")
  }

  if (leftTitle && leftTitle === rightTitle) {
    score += 45
    reasons.push("objet identique")
  } else {
    const titleSimilarity = serviceTextSimilarity(left.title, right.title)
    if (titleSimilarity >= 0.6) {
      score += 25
      reasons.push("objet très proche")
    } else if (titleSimilarity >= 0.35) {
      score += 15
      reasons.push("objet proche")
    }
  }

  const descriptionSimilarity = serviceTextSimilarity(left.description, right.description)
  if (descriptionSimilarity >= 0.8) {
    score += 25
    reasons.push("description quasi identique")
  } else if (descriptionSimilarity >= 0.55) {
    score += 15
    reasons.push("description proche")
  }

  if (left.type && left.type === right.type) score += 5

  const hoursApart = Math.abs(new Date(left.requestedAt).getTime() - new Date(right.requestedAt).getTime()) / 3_600_000
  if (hoursApart <= 24) {
    score += 20
    reasons.push("créés à moins de 24 h")
  } else if (hoursApart <= 24 * 7) {
    score += 10
    reasons.push("créés la même semaine")
  } else if (hoursApart <= 24 * 30) {
    score += 5
    reasons.push("créés le même mois")
  }

  const boundedScore = Math.min(100, score)
  if (boundedScore < 50) return null
  return {
    score: boundedScore,
    confidence: boundedScore >= 75 ? "FORTE" : boundedScore >= 60 ? "PROBABLE" : "À_VÉRIFIER",
    reasons,
  }
}
