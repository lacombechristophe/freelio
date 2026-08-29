export type ServiceRoutingCandidate = {
  id: string
  role: string
  available: boolean
  capacity: number
  activeTickets: number
  skills: string[]
  territories: string[]
}

export type ServiceRoutingRequest = {
  requiredSkill?: string | null
  territory?: string | null
  priority?: string | null
}

const serviceRoles = new Set(["OWNER", "ADMIN", "SERVICE", "TECHNICIAN"])

function normalized(value: string | null | undefined) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("fr-FR")
}

export function serviceRoutingTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((item) => typeof item === "string" ? [item.trim()] : []).filter(Boolean))].slice(0, 50)
}

function tagMatches(tags: string[], expected: string) {
  const values = tags.map(normalized)
  return values.includes("*") || values.includes(expected)
}

export function recommendServiceAssignee(request: ServiceRoutingRequest, candidates: ServiceRoutingCandidate[]) {
  const skill = normalized(request.requiredSkill)
  const territory = normalized(request.territory)
  const eligible = candidates.filter((candidate) => serviceRoles.has(candidate.role) && candidate.available && candidate.capacity > 0)
  const withinCapacity = eligible.filter((candidate) => candidate.activeTickets < candidate.capacity)
  let pool = withinCapacity.length > 0 ? withinCapacity : request.priority === "URGENT" ? eligible : []
  const capacityOverflow = withinCapacity.length === 0 && pool.length > 0
  if (pool.length === 0) return null

  const skillMatches = skill ? pool.filter((candidate) => tagMatches(candidate.skills, skill)) : []
  const matchedSkill = skillMatches.length > 0
  if (matchedSkill) pool = skillMatches

  const territoryMatches = territory ? pool.filter((candidate) => tagMatches(candidate.territories, territory)) : []
  const matchedTerritory = territoryMatches.length > 0
  if (matchedTerritory) pool = territoryMatches

  pool.sort((left, right) => {
    const load = left.activeTickets / left.capacity - right.activeTickets / right.capacity
    return load || left.activeTickets - right.activeTickets || left.id.localeCompare(right.id)
  })
  const candidate = pool[0]
  const reasons = [
    matchedSkill ? `compétence « ${request.requiredSkill} »` : skill ? `repli sans compétence « ${request.requiredSkill} »` : "compétence générale",
    matchedTerritory ? `zone « ${request.territory} »` : territory ? `repli hors zone « ${request.territory} »` : "toutes zones",
    `${candidate.activeTickets}/${candidate.capacity} tickets actifs`,
  ]
  if (capacityOverflow) reasons.push("urgence affectée malgré capacité atteinte")
  return { membershipId: candidate.id, reason: reasons.join(" · "), capacityOverflow }
}
