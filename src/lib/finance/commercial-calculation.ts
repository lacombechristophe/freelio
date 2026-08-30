export type CommercialLineCategory = "MATERIAL" | "LABOR" | "SERVICE" | "OTHER"

export type CommercialLineInput = {
  quantity: number
  unitPriceCents: number
  tvaRate: number
  lineDiscountRate?: number
  unitCostCents?: number | null
  category?: CommercialLineCategory
}

export type CommercialLineCalculation = CommercialLineInput & {
  index: number
  grossHtCents: number
  effectiveUnitPriceCents: number
  lineDiscountRate: number
  lineDiscountCents: number
  netBeforeGlobalDiscountCents: number
  globalDiscountShareCents: number
  netHtCents: number
  tvaCents: number
  totalTtcCents: number
  costCents: number | null
  marginCents: number | null
}

export type CommercialDocumentCalculation = {
  grossHtCents: number
  lineDiscountCents: number
  globalDiscountRate: number
  globalDiscountCents: number
  totalHtCents: number
  totalTvaCents: number
  totalTtcCents: number
  knownCostCents: number
  knownMarginCents: number
  costedLineCount: number
  lines: CommercialLineCalculation[]
  vatBreakdown: Array<{
    tvaRate: number
    baseHtCents: number
    tvaCents: number
    totalTtcCents: number
  }>
  marginBreakdown: Array<{
    category: CommercialLineCategory
    revenueHtCents: number
    costCents: number
    marginCents: number
  }>
}

type CalculationOptions = {
  globalDiscountRate?: number
  taxEnabled?: boolean
}

function assertFinite(name: string, value: number) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} doit être un nombre fini`)
}

function assertLine(line: CommercialLineInput, index: number) {
  assertFinite(`Quantité de la ligne ${index + 1}`, line.quantity)
  assertFinite(`Prix de la ligne ${index + 1}`, line.unitPriceCents)
  assertFinite(`TVA de la ligne ${index + 1}`, line.tvaRate)
  if (line.quantity <= 0) throw new RangeError(`La quantité de la ligne ${index + 1} doit être positive`)
  if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) {
    throw new RangeError(`Le prix de la ligne ${index + 1} doit être un entier positif en centimes`)
  }
  if (line.tvaRate < 0 || line.tvaRate > 100) {
    throw new RangeError(`Le taux de TVA de la ligne ${index + 1} doit être compris entre 0 et 100`)
  }
  const lineDiscountRate = line.lineDiscountRate ?? 0
  assertFinite(`Remise de la ligne ${index + 1}`, lineDiscountRate)
  if (lineDiscountRate < 0 || lineDiscountRate > 100) {
    throw new RangeError(`La remise de la ligne ${index + 1} doit être comprise entre 0 et 100`)
  }
  if (line.unitCostCents != null) {
    if (!Number.isSafeInteger(line.unitCostCents) || line.unitCostCents < 0) {
      throw new RangeError(`Le coût de la ligne ${index + 1} doit être un entier positif en centimes`)
    }
  }
}

function allocateProportionally(amountCents: number, weights: number[]) {
  const allocation = weights.map(() => 0)
  if (amountCents === 0) return allocation

  const totalWeight = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0)
  if (totalWeight === 0) return allocation

  const shares = weights.map((weight, index) => {
    const exact = amountCents * Math.max(0, weight) / totalWeight
    const cents = Math.floor(exact)
    allocation[index] = cents
    return { index, remainder: exact - cents }
  })
  let remaining = amountCents - allocation.reduce((sum, value) => sum + value, 0)

  shares.sort((left, right) => right.remainder - left.remainder || left.index - right.index)
  for (let index = 0; index < shares.length && remaining > 0; index += 1) {
    allocation[shares[index].index] += 1
    remaining -= 1
  }
  return allocation
}

export function applyPercentageDiscount(amountCents: number, rate: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new RangeError("Le montant doit être un entier positif en centimes")
  }
  assertFinite("Le taux de remise", rate)
  if (rate < 0 || rate > 100) throw new RangeError("Le taux de remise doit être compris entre 0 et 100")
  return Math.max(0, amountCents - Math.round(amountCents * rate / 100))
}

export function calculateCommercialDocument(
  inputLines: CommercialLineInput[],
  options: CalculationOptions = {}
): CommercialDocumentCalculation {
  const globalDiscountRate = options.globalDiscountRate ?? 0
  assertFinite("Le taux de remise globale", globalDiscountRate)
  if (globalDiscountRate < 0 || globalDiscountRate > 100) {
    throw new RangeError("Le taux de remise globale doit être compris entre 0 et 100")
  }

  inputLines.forEach(assertLine)
  const grossLines = inputLines.map((line) => Math.round(line.quantity * line.unitPriceCents))
  const effectiveUnitPrices = inputLines.map((line) => applyPercentageDiscount(line.unitPriceCents, line.lineDiscountRate ?? 0))
  const netBeforeGlobalDiscountLines = inputLines.map((line, index) => Math.round(line.quantity * effectiveUnitPrices[index]))
  const grossHtCents = grossLines.reduce((sum, amount) => sum + amount, 0)
  const lineDiscountCents = grossLines.reduce((sum, amount, index) => sum + amount - netBeforeGlobalDiscountLines[index], 0)
  const netBeforeGlobalDiscountCents = netBeforeGlobalDiscountLines.reduce((sum, amount) => sum + amount, 0)
  const globalDiscountCents = Math.round(netBeforeGlobalDiscountCents * globalDiscountRate / 100)
  const discountShares = allocateProportionally(globalDiscountCents, netBeforeGlobalDiscountLines)

  const lines = inputLines.map((line, index): CommercialLineCalculation => {
    const netHtCents = netBeforeGlobalDiscountLines[index] - discountShares[index]
    const tvaRate = options.taxEnabled === false ? 0 : line.tvaRate
    const tvaCents = Math.round(netHtCents * tvaRate / 100)
    const costCents = line.unitCostCents == null
      ? null
      : Math.round(line.quantity * line.unitCostCents)

    return {
      ...line,
      tvaRate,
      category: line.category ?? "OTHER",
      index,
      grossHtCents: grossLines[index],
      effectiveUnitPriceCents: effectiveUnitPrices[index],
      lineDiscountRate: line.lineDiscountRate ?? 0,
      lineDiscountCents: grossLines[index] - netBeforeGlobalDiscountLines[index],
      netBeforeGlobalDiscountCents: netBeforeGlobalDiscountLines[index],
      globalDiscountShareCents: discountShares[index],
      netHtCents,
      tvaCents,
      totalTtcCents: netHtCents + tvaCents,
      costCents,
      marginCents: costCents == null ? null : netHtCents - costCents,
    }
  })

  const vat = new Map<number, { baseHtCents: number; tvaCents: number }>()
  const margins = new Map<CommercialLineCategory, { revenueHtCents: number; costCents: number }>()
  for (const line of lines) {
    const vatBucket = vat.get(line.tvaRate) ?? { baseHtCents: 0, tvaCents: 0 }
    vatBucket.baseHtCents += line.netHtCents
    vatBucket.tvaCents += line.tvaCents
    vat.set(line.tvaRate, vatBucket)

    if (line.costCents != null) {
      const category = line.category ?? "OTHER"
      const marginBucket = margins.get(category) ?? { revenueHtCents: 0, costCents: 0 }
      marginBucket.revenueHtCents += line.netHtCents
      marginBucket.costCents += line.costCents
      margins.set(category, marginBucket)
    }
  }

  const totalHtCents = lines.reduce((sum, line) => sum + line.netHtCents, 0)
  const totalTvaCents = lines.reduce((sum, line) => sum + line.tvaCents, 0)
  const knownCostCents = lines.reduce((sum, line) => sum + (line.costCents ?? 0), 0)
  const knownMarginCents = lines.reduce((sum, line) => sum + (line.marginCents ?? 0), 0)

  return {
    grossHtCents,
    lineDiscountCents,
    globalDiscountRate,
    globalDiscountCents,
    totalHtCents,
    totalTvaCents,
    totalTtcCents: totalHtCents + totalTvaCents,
    knownCostCents,
    knownMarginCents,
    costedLineCount: lines.filter((line) => line.costCents != null).length,
    lines,
    vatBreakdown: [...vat.entries()]
      .sort(([left], [right]) => left - right)
      .map(([tvaRate, bucket]) => ({
        tvaRate,
        ...bucket,
        totalTtcCents: bucket.baseHtCents + bucket.tvaCents,
      })),
    marginBreakdown: [...margins.entries()].map(([category, bucket]) => ({
      category,
      ...bucket,
      marginCents: bucket.revenueHtCents - bucket.costCents,
    })),
  }
}
