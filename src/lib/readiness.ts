const MIN_SECRET_LENGTH = 32

function hasValue(environment: NodeJS.ProcessEnv, name: string) {
  return Boolean(environment[name]?.trim())
}

function hasSecret(environment: NodeJS.ProcessEnv, name: string) {
  return (environment[name]?.trim().length ?? 0) >= MIN_SECRET_LENGTH
}

function isHttpsUrl(value: string | undefined) {
  if (!value) return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

export function productionConfigurationIssues(environment: NodeJS.ProcessEnv = process.env) {
  if (environment.NODE_ENV !== "production") return []

  const issues: string[] = []
  const databaseUrl = environment.DATABASE_URL?.trim() ?? ""
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) issues.push("DATABASE_URL_POSTGRESQL")

  for (const name of ["AUTH_SECRET", "ENCRYPTION_KEY", "JWT_SECRET", "CONSENT_TOKEN_SECRET", "LEAD_HASH_SALT", "LEAD_INGEST_SECRET", "AUTOMATION_CRON_SECRET"]) {
    if (!hasSecret(environment, name)) issues.push(name)
  }
  if (hasValue(environment, "SCHEDULER_CRON_SECRET") && !hasSecret(environment, "SCHEDULER_CRON_SECRET")) issues.push("SCHEDULER_CRON_SECRET")
  for (const name of ["RESEND_API_KEY", "RESEND_WEBHOOK_SECRET", "EMAIL_FROM", "LEAD_ALLOWED_ORIGINS"]) {
    if (!hasValue(environment, name)) issues.push(name)
  }
  for (const name of ["AUTH_URL", "PUBLIC_APP_URL", "PUBLIC_PRIVACY_NOTICE_URL"]) {
    if (!isHttpsUrl(environment[name])) issues.push(`${name}_HTTPS`)
  }

  if (environment.FILE_STORAGE_DRIVER?.trim().toLowerCase() !== "r2") issues.push("FILE_STORAGE_DRIVER_R2")
  if (environment.MIGRATION_STORAGE_DRIVER?.trim().toLowerCase() !== "r2") issues.push("MIGRATION_STORAGE_DRIVER_R2")
  for (const name of ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"]) {
    if (!hasValue(environment, name)) issues.push(name)
  }

  return issues
}
