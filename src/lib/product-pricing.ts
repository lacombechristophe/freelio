export function calculateConfiguredProductPrice(input: {
  baseSalePriceCents: number
  baseCostCents: number
  optionSaleDeltasCents: number[]
  optionCostDeltasCents: number[]
  discountRate: number
}) {
  const listUnitPriceCents = input.baseSalePriceCents + input.optionSaleDeltasCents.reduce((sum, value) => sum + value, 0)
  const unitCostCents = input.baseCostCents + input.optionCostDeltasCents.reduce((sum, value) => sum + value, 0)
  const discountRate = Math.min(100, Math.max(0, input.discountRate))
  const unitPriceCents = Math.max(0, Math.round(listUnitPriceCents * (1 - discountRate / 100)))
  return { listUnitPriceCents, unitPriceCents, unitCostCents, discountRate, marginCents: unitPriceCents - unitCostCents }
}

export function resolveProductOptionSelection<T extends { id: string; label: string }>(groups: Array<{ id: string; name: string; minSelect: number; maxSelect: number; values: T[] }>, optionValueIds: string[]) {
  const uniqueIds = [...new Set(optionValueIds)]
  if (uniqueIds.length !== optionValueIds.length) throw new Error("Options dupliquées")
  const allValues = groups.flatMap((group) => group.values.map((value) => ({ ...value, groupId: group.id, groupName: group.name })))
  const selectedValues = allValues.filter((value) => uniqueIds.includes(value.id))
  if (selectedValues.length !== uniqueIds.length) throw new Error("Une option ne correspond pas au produit")
  for (const group of groups) {
    const count = selectedValues.filter((value) => value.groupId === group.id).length
    if (count < group.minSelect || count > group.maxSelect) throw new Error(`${group.name} : sélectionnez entre ${group.minSelect} et ${group.maxSelect} option${group.maxSelect > 1 ? "s" : ""}`)
  }
  const selections = groups.flatMap((group) => {
    const labels = selectedValues.filter((value) => value.groupId === group.id).map((value) => value.label)
    return labels.length ? [{ groupId: group.id, groupName: group.name, labels }] : []
  })
  return { uniqueIds, selectedValues, selections }
}
