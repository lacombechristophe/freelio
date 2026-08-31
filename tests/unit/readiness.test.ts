import { describe, expect, it } from "vitest"

import { productionConfigurationIssues } from "@/lib/readiness"

const validProductionEnvironment = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:password@db.example.test:5432/crm?sslmode=require",
  AUTH_SECRET: "a".repeat(32),
  ENCRYPTION_KEY: "b".repeat(32),
  JWT_SECRET: "c".repeat(32),
  CONSENT_TOKEN_SECRET: "d".repeat(32),
  LEAD_HASH_SALT: "e".repeat(32),
  LEAD_INGEST_SECRET: "f".repeat(32),
  AUTOMATION_CRON_SECRET: "g".repeat(32),
  CRON_SECRET: "i".repeat(32),
  SCHEDULER_CRON_SECRET: "h".repeat(32),
  RESEND_API_KEY: "resend-test-key",
  RESEND_WEBHOOK_SECRET: "whsec_test-key",
  EMAIL_FROM: "CRM <noreply@example.test>",
  PUBLIC_LEAD_COMPANY_ID: "company-id",
  LEAD_ALLOWED_ORIGINS: "https://example.test",
  UPSTASH_REDIS_REST_URL: "https://redis.example.test",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  STRIPE_SECRET_KEY: "sk_test_key",
  STRIPE_WEBHOOK_SECRET: "j".repeat(32),
  STRIPE_PRICE_ATELIER: "price_atelier",
  STRIPE_PRICE_RESEAU: "price_reseau",
  AUTH_URL: "https://crm.example.test",
  PUBLIC_APP_URL: "https://crm.example.test",
  PUBLIC_PRIVACY_NOTICE_URL: "https://example.test/privacy",
  FILE_STORAGE_DRIVER: "r2",
  MIGRATION_STORAGE_DRIVER: "r2",
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET_NAME: "crm-private",
} satisfies NodeJS.ProcessEnv

describe("productionConfigurationIssues", () => {
  it("does not block local development", () => {
    expect(productionConfigurationIssues({ NODE_ENV: "development" })).toEqual([])
  })

  it("accepts a complete production configuration", () => {
    expect(productionConfigurationIssues(validProductionEnvironment)).toEqual([])
  })

  it("keeps optional platform email and SaaS billing out of core readiness", () => {
    const environment = {
      ...validProductionEnvironment,
      RESEND_API_KEY: undefined,
      RESEND_WEBHOOK_SECRET: undefined,
      EMAIL_FROM: undefined,
      STRIPE_SECRET_KEY: undefined,
      STRIPE_WEBHOOK_SECRET: undefined,
      STRIPE_PRICE_ATELIER: undefined,
      STRIPE_PRICE_RESEAU: undefined,
    }
    expect(productionConfigurationIssues(environment)).toEqual([])
  })

  it("enforces optional providers when their production feature flag is enabled", () => {
    const issues = productionConfigurationIssues({
      ...validProductionEnvironment,
      REQUIRE_PLATFORM_EMAIL: "true",
      REQUIRE_BILLING: "true",
      EMAIL_FROM: undefined,
      STRIPE_WEBHOOK_SECRET: "short",
    })
    expect(issues).toEqual(expect.arrayContaining(["EMAIL_FROM", "STRIPE_WEBHOOK_SECRET"]))
  })

  it("accepts the documented legacy R2 credential aliases during migration", () => {
    expect(productionConfigurationIssues({
      ...validProductionEnvironment,
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
      R2_ACCESS_KEY: "access",
      R2_SECRET_KEY: "secret",
    })).toEqual([])
  })

  it("rejects unsafe production database, URL, secret and storage settings", () => {
    const issues = productionConfigurationIssues({ ...validProductionEnvironment, DATABASE_URL: "file:./prod.db", AUTH_URL: "http://crm.example.test", AUTH_SECRET: "short", FILE_STORAGE_DRIVER: "local" })
    expect(issues).toEqual(expect.arrayContaining(["DATABASE_URL_POSTGRESQL", "AUTH_URL_HTTPS", "AUTH_SECRET", "FILE_STORAGE_DRIVER_R2"]))
  })
})
