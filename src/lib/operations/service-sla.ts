export const DEFAULT_SERVICE_RESOLUTION_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH: 24,
  NORMAL: 72,
  LOW: 120,
}

export function serviceResolutionTarget(input: { requestedAt: Date; dueAt?: Date | null; priority: string }) {
  if (input.dueAt) return { targetAt: input.dueAt, source: "CUSTOM" as const }
  const hours = DEFAULT_SERVICE_RESOLUTION_HOURS[input.priority] ?? DEFAULT_SERVICE_RESOLUTION_HOURS.NORMAL
  return { targetAt: new Date(input.requestedAt.getTime() + hours * 60 * 60 * 1_000), source: "DEFAULT" as const }
}

export function serviceTargetIsBreached(input: { targetAt: Date; status: string; now?: Date }) {
  return !["RESOLVED", "CLOSED"].includes(input.status) && input.targetAt < (input.now ?? new Date())
}
