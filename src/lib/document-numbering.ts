import { getContext, requestContext } from "@/lib/context"

export const DOCUMENT_NUMBER_MAX_RETRIES = 20

// Number uniqueness is company-wide, including documents outside the author's agencies.
// Only the numeric catalogue query runs in this context; the document write keeps its agency scope.
export function readCompanyDocumentNumbers<T>(read: () => Promise<T>): Promise<T> {
  const context = getContext()
  return context ? requestContext.run({ ...context, agencyIds: null }, read) : read()
}

export function buildYearlyDocumentPrefix(
  customPrefix: string | null | undefined,
  fallbackPrefix: string,
  date = new Date()
) {
  return `${customPrefix || fallbackPrefix}${date.getFullYear()}-`
}

export function nextDocumentNumber(
  existing: string | null | undefined | ReadonlyArray<{ number: string }>,
  prefix: string,
) {
  const candidates = typeof existing === "string" ? [{ number: existing }] : existing ?? []
  let highest = BigInt(0)
  for (const { number } of candidates) {
    if (!number.startsWith(prefix)) continue
    const suffix = number.slice(prefix.length)
    if (!/^\d+$/.test(suffix)) continue
    const sequence = BigInt(suffix)
    if (sequence > highest) highest = sequence
  }
  return `${prefix}${(highest + BigInt(1)).toString().padStart(3, "0")}`
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
      await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (attempt + 1), 50)))
    }
  }

  throw new Error(
    `Impossible de générer un numéro unique${options.label ? ` pour ${options.label}` : ""}.`,
    { cause: lastConflict }
  )
}
