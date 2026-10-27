import pino from "pino"

const logger = pino({
  redact: {
    paths: [
      "authorization",
      "cookie",
      "password",
      "passwordHash",
      "apiKey",
      "token",
      "secret",
      "credentialsEncrypted",
      "*.authorization",
      "*.cookie",
      "*.password",
      "*.passwordHash",
      "*.apiKey",
      "*.token",
      "*.secret",
      "*.credentialsEncrypted",
    ],
    censor: "[REDACTED]",
  },
  browser: {
    asObject: true,
  },
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport:
    process.env.NODE_ENV !== "production"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            ignore: "pid,hostname",
          },
        }
      : undefined,
})

export default logger

/**
 * Log a named application event with structured metadata.
 */
export function logEvent(action: string, metadata: Record<string, unknown>) {
  logger.info({
    action,
    timestamp: new Date().toISOString(),
    ...metadata,
  })
}
