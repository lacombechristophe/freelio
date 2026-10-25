/** Read structured uniqueness metadata from the native engine or a driver adapter. */
export function uniqueConstraintTarget(error: unknown): unknown {
  if (!error || typeof error !== "object") return undefined
  const candidate = error as { code?: unknown; meta?: { target?: unknown; driverAdapterError?: { cause?: { kind?: unknown; constraint?: { fields?: unknown; index?: unknown } } } } }
  if (candidate.code !== "P2002") return undefined
  if (candidate.meta?.target !== undefined) return candidate.meta.target
  const cause = candidate.meta?.driverAdapterError?.cause
  if (cause?.kind !== "UniqueConstraintViolation") return undefined
  return cause.constraint?.fields ?? cause.constraint?.index
}
