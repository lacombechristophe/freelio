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
  SCHEDULER_CRON_SECRET: "h".repeat(32),
  RESEND_API_KEY: "resend-test-key",
  RESEND_WEBHOOK_SECRET: "whsec_test-key",
  EMAIL_FROM: "CRM <noreply@example.test>",
  PUBLIC_LEAD_COMPANY_ID: "company-id",
  LEAD_ALLOWED_ORIGINS: "https://example.test",
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

  it("rejects unsafe production database, URL, secret and storage settings", () => {
    const issues = productionConfigurationIssues({ ...validProductionEnvironment, DATABASE_URL: "file:./prod.db", AUTH_URL: "http://crm.example.test", AUTH_SECRET: "short", FILE_STORAGE_DRIVER: "local" })
    expect(issues).toEqual(expect.arrayContaining(["DATABASE_URL_POSTGRESQL", "AUTH_URL_HTTPS", "AUTH_SECRET", "FILE_STORAGE_DRIVER_R2"]))
  })
})
