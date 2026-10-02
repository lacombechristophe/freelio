import type { RedisOptions } from "ioredis"
import { isIP } from "node:net"

type RedisEnvironment = Partial<Record<"NODE_ENV" | "REDIS_URL" | "REDIS_HOST" | "REDIS_PORT" | "REDIS_USERNAME" | "REDIS_PASSWORD", string>>

/** Producers fail promptly; workers retain their connection while Redis recovers. */
export function redisConnection(role: "producer" | "worker", environment: RedisEnvironment = process.env): RedisOptions {
  const raw = environment.REDIS_URL?.trim()
  let endpoint: Pick<RedisOptions, "host" | "port" | "username" | "password" | "db" | "tls">
  if (raw) {
    try {
      const url = new URL(raw)
      if (!["redis:", "rediss:"].includes(url.protocol) || !url.hostname || url.search || url.hash || !/^\/(\d+)?$/.test(url.pathname || "/")) throw new Error()
      const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0
      if (!Number.isSafeInteger(db) || db < 0 || (url.port && Number(url.port) < 1)) throw new Error()
      const host = url.hostname.replace(/^\[|\]$/g, "")
      endpoint = {
        host, port: url.port ? Number(url.port) : 6379, db,
        ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
        ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
        ...(url.protocol === "rediss:" ? { tls: { rejectUnauthorized: true, ...(isIP(host) ? {} : { servername: host }) } } : {}),
      }
    } catch { throw new Error("REDIS_URL doit être une URL redis:// ou rediss:// valide, sans query ni fragment") }
  } else {
    if (environment.NODE_ENV === "production" && !environment.REDIS_HOST?.trim()) throw new Error("REDIS_URL ou REDIS_HOST requis pour le worker en production")
    const port = Number(environment.REDIS_PORT || 6379)
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("REDIS_PORT invalide")
    endpoint = { host: environment.REDIS_HOST?.trim() || "localhost", port,
      ...(environment.REDIS_USERNAME ? { username: environment.REDIS_USERNAME } : {}),
      ...(environment.REDIS_PASSWORD ? { password: environment.REDIS_PASSWORD } : {}),
    }
  }
  return { ...endpoint, connectTimeout: 10_000, maxRetriesPerRequest: role === "worker" ? null : 1 }
}
