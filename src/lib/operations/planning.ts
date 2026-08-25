export type PlanningSlot = {
  id: string
  scheduledStart: Date | string
  scheduledEnd: Date | string | null
}

export type RouteStop = {
  latitude: number | null
  longitude: number | null
}

const DEFAULT_DURATION_MS = 60 * 60 * 1_000

export function planningEnd(slot: Pick<PlanningSlot, "scheduledStart" | "scheduledEnd">) {
  const start = new Date(slot.scheduledStart)
  return slot.scheduledEnd ? new Date(slot.scheduledEnd) : new Date(start.getTime() + DEFAULT_DURATION_MS)
}

export function planningSlotsOverlap(
  left: Pick<PlanningSlot, "scheduledStart" | "scheduledEnd">,
  right: Pick<PlanningSlot, "scheduledStart" | "scheduledEnd">,
) {
  const leftStart = new Date(left.scheduledStart).getTime()
  const rightStart = new Date(right.scheduledStart).getTime()
  return leftStart < planningEnd(right).getTime() && rightStart < planningEnd(left).getTime()
}

export function haversineKm(left: RouteStop, right: RouteStop) {
  if (left.latitude == null || left.longitude == null || right.latitude == null || right.longitude == null) return null
  const radians = (degrees: number) => degrees * Math.PI / 180
  const latitudeDelta = radians(right.latitude - left.latitude)
  const longitudeDelta = radians(right.longitude - left.longitude)
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2
  return 6_371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function routeDistanceKm(stops: RouteStop[]) {
  let distanceKm = 0
  let measuredLegs = 0
  for (let index = 1; index < stops.length; index += 1) {
    const distance = haversineKm(stops[index - 1], stops[index])
    if (distance != null) {
      distanceKm += distance
      measuredLegs += 1
    }
  }
  return { distanceKm, measuredLegs, totalLegs: Math.max(stops.length - 1, 0) }
}
