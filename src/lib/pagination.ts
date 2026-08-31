export function boundedPageSize(value: unknown, fallback: number, maximum: number) {
  if (!Number.isInteger(value) || (value as number) <= 0) return fallback
  return Math.min(value as number, maximum)
}
