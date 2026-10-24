export function upstashRateLimitConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const url = environment.UPSTASH_REDIS_REST_URL?.trim()
  const token = environment.UPSTASH_REDIS_REST_TOKEN?.trim()
  if (!url || !token || url.includes("your-url") || token.includes("your-token")) return null
  try {
    const endpoint = new URL(url)
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) return null
  } catch { return null }
  return { url, token }
}
