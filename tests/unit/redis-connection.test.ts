import { expect, it } from "vitest"
import { redisConnection } from "@/lib/bullmq/connection"

it("decodes managed Redis credentials, keeps certificate verification and separates retries", () => {
  const environment = { NODE_ENV: "production", REDIS_URL: "rediss://recipe:synthetic%2Fpassword@redis.example.test:6380/2" } as NodeJS.ProcessEnv
  expect(redisConnection("worker", environment)).toMatchObject({ host: "redis.example.test", port: 6380, db: 2, username: "recipe", password: "synthetic/password", tls: { rejectUnauthorized: true, servername: "redis.example.test" }, maxRetriesPerRequest: null })
  expect(redisConnection("producer", environment).maxRetriesPerRequest).toBe(1)
})

it.each(["https://redis.example.test/", "redis://localhost/abc", "redis://localhost/0?password=synthetic-secret", "redis://localhost/#secret", "rediss://user:bad%ZZ@host/0", "redis://host:99999/", "redis://host:0/"])("refuses malformed endpoints without reflecting their credentials: %s", REDIS_URL => {
  expect(() => redisConnection("worker", { REDIS_URL })).toThrow("REDIS_URL")
  try { redisConnection("worker", { REDIS_URL }) } catch (error) { expect(String(error)).not.toContain(REDIS_URL) }
})

it("refuses implicit production localhost but preserves the development fallback", () => {
  expect(() => redisConnection("worker", { NODE_ENV: "production" })).toThrow("requis")
  expect(redisConnection("producer", { NODE_ENV: "development" })).toMatchObject({ host: "localhost", port: 6379 })
  expect(() => redisConnection("worker", { REDIS_PORT: "6379oops" })).toThrow("REDIS_PORT")
})
