import pino from "pino"

const logger = pino({
  browser: {
    asObject: true
  },
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  transport: process.env.NODE_ENV !== "production" ? {
    target: "pino-pretty",
    options: {
      colorize: true,
      ignore: "pid,hostname"
    }
  } : undefined
})

export default logger

/**
 * Standard log helper to include userId and action metadata
 * compliant with L868.
 */
export function logEvent(action: string, metadata: any) {
  logger.info({
    action,
    timestamp: new Date().toISOString(),
    ...metadata
  })
}
