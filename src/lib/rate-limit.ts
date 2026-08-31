import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

type RateLimiter = {
  limit: (identifier: string) => Promise<{
    success: boolean
    limit: number
    remaining: number
    reset: number
  }>
}

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN

const hasUpstashConfig =
  !!upstashUrl &&
  !!upstashToken &&
  !upstashUrl.includes("your-url") &&
  !upstashToken.includes("your-token")

const memoryBuckets = new Map<string, { count: number; reset: number }>()
let memoryRequests = 0

function pruneMemoryBuckets(now: number) {
  memoryRequests += 1
  if (memoryRequests % 1_000 !== 0 && memoryBuckets.size <= 10_000) return
  for (const [key, bucket] of memoryBuckets) if (bucket.reset <= now) memoryBuckets.delete(key)
  while (memoryBuckets.size > 10_000) {
    const oldest = memoryBuckets.keys().next().value
    if (!oldest) break
    memoryBuckets.delete(oldest)
  }
}

function createMemoryRateLimit(limit: number, windowMs: number, prefix: string): RateLimiter {
  return {
    async limit(identifier: string) {
      const now = Date.now()
      pruneMemoryBuckets(now)
      const key = `${prefix}:${identifier}`
      let bucket = memoryBuckets.get(key)

      if (!bucket || bucket.reset <= now) {
        bucket = { count: 0, reset: now + windowMs }
        memoryBuckets.set(key, bucket)
      }

      bucket.count += 1

      return {
        success: bucket.count <= limit,
        limit,
        remaining: Math.max(limit - bucket.count, 0),
        reset: bucket.reset,
      }
    },
  }
}

function createRateLimit({
  limit,
  window,
  windowMs,
  prefix,
}: {
  limit: number
  window: `${number} ${"m" | "h"}`
  windowMs: number
  prefix: string
}): RateLimiter {
  if (!hasUpstashConfig) {
    return createMemoryRateLimit(limit, windowMs, prefix)
  }

  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: true,
    prefix,
  })
}

// Create a new ratelimiter, that allows 30 requests per hour
// for the AI assistant
export const aiRateLimit = createRateLimit({
  limit: 30,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/ai",
})

// Strict limit for login attempts: 5 per 15 minutes
export const authRateLimit = createRateLimit({
  limit: 5,
  window: "15 m",
  windowMs: 15 * 60 * 1000,
  prefix: "@crm/auth",
})

export const passwordResetRateLimit = createRateLimit({
  limit: 5,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/password-reset",
})

// Standard public API limit: 100 per minute
export const apiRateLimit = createRateLimit({
  limit: 100,
  window: "1 m",
  windowMs: 60 * 1000,
  prefix: "@crm/api",
})

// A signing link is a bearer credential. Limit repeated attempts per link and IP.
export const signatureRateLimit = createRateLimit({
  limit: 10,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/signature",
})

// Public lead forms need a tighter,
// dedicated bucket so abusive submissions do not affect authenticated APIs.
export const leadRateLimit = createRateLimit({
  limit: 12,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/leads",
})

// Consent withdrawal links are public bearer links. Keep their traffic isolated
// from lead capture and authenticated API limits.
export const consentRateLimit = createRateLimit({
  limit: 20,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/consent",
})

// Client-portal bearer links and write endpoints share a dedicated bucket.
export const portalRateLimit = createRateLimit({
  limit: 30,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/portal",
})

// Manual catch-up can create tasks and send e-mails. Keep it company-scoped and
// bounded independently from the persistent worker/cron processors.
export const automationProcessRateLimit = createRateLimit({
  limit: 10,
  window: "1 h",
  windowMs: 60 * 60 * 1000,
  prefix: "@crm/automation-process",
})
