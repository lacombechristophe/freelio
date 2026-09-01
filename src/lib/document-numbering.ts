export const DOCUMENT_NUMBER_MAX_RETRIES = 5

export function buildYearlyDocumentPrefix(
  customPrefix: string | null | undefined,
  fallbackPrefix: string,
  date = new Date()
) {
  return `${customPrefix || fallbackPrefix}${date.getFullYear()}-`
}

export function nextDocumentNumber(lastNumber: string | null | undefined, prefix: string) {
  const match = lastNumber?.match(/(\d+)$/)
  const nextSequence = match ? Number.parseInt(match[1], 10) + 1 : 1

  return `${prefix}${nextSequence.toString().padStart(3, "0")}`
}

export function isDocumentNumberConflict(error: unknown) {
  return isUniqueConstraintConflict(error, "number", true)
}

export function isUniqueConstraintConflict(error: unknown, field: string, acceptUnknownTarget = false) {
  if (!error || typeof error !== "object") return false

  const maybePrismaError = error as {
    code?: string
    meta?: { target?: unknown }
  }

  if (maybePrismaError.code !== "P2002") return false

  const target = maybePrismaError.meta?.target
  if (!target) return acceptUnknownTarget
  if (Array.isArray(target)) return target.includes(field)
  if (typeof target === "string") return target.includes(field)

  return acceptUnknownTarget
}

export async function withDocumentNumberRetry<T>(
  operation: () => Promise<T>,
  options: { maxRetries?: number; label?: string } = {}
) {
  const maxRetries = options.maxRetries ?? DOCUMENT_NUMBER_MAX_RETRIES
  let lastConflict: unknown

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isDocumentNumberConflict(error) || attempt === maxRetries - 1) {
        throw error
      }
      lastConflict = error
    }
  }

  throw new Error(
    `Impossible de générer un numéro unique${options.label ? ` pour ${options.label}` : ""}.`,
    { cause: lastConflict }
  )
}
