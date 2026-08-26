export function serviceArticleSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "article"
}

type SatisfactionResponse = {
  type: string
  scaleMin: number
  scaleMax: number
  score: number
}

export function satisfactionMetrics(responses: SatisfactionResponse[]) {
  const valid = responses.filter((item) => Number.isInteger(item.score) && item.score >= item.scaleMin && item.score <= item.scaleMax)
  const average = valid.length ? valid.reduce((sum, item) => sum + item.score, 0) / valid.length : null
  const csat = valid.filter((item) => item.type === "CSAT")
  const csatPositive = csat.filter((item) => item.score >= Math.max(item.scaleMin, item.scaleMax - 1)).length
  const nps = valid.filter((item) => item.type === "NPS" && item.scaleMin === 0 && item.scaleMax === 10)
  const promoters = nps.filter((item) => item.score >= 9).length
  const detractors = nps.filter((item) => item.score <= 6).length

  return {
    responses: valid.length,
    average,
    csatPercent: csat.length ? Math.round((csatPositive / csat.length) * 100) : null,
    nps: nps.length ? Math.round(((promoters - detractors) / nps.length) * 100) : null,
  }
}

