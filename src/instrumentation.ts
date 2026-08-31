import { registerOTel } from "@vercel/otel"
import type { Instrumentation } from "next"

export function register() {
  registerOTel("freelio-crm")
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ""
  // Browser navigation and closed streaming responses are expected cancellations,
  // not application incidents. Keeping them out avoids noisy production alerts.
  if (name === "AbortError" || message === "The destination stream closed early." || message === "The operation was aborted.") return
  const digest = typeof error === "object" && error !== null && "digest" in error ? String(error.digest) : undefined
  console.error("Unhandled server request error", {
    message,
    digest,
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
