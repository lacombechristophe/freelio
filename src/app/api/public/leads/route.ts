import { timingSafeEqual } from "node:crypto"
import { ZodError } from "zod"

import { capturePublicLead, hashLeadRequestValue, LeadConfigurationError } from "@/lib/leads/capture"
import { leadRateLimit } from "@/lib/rate-limit"

export const runtime = "nodejs"

function allowedOrigins() {
  const configured = process.env.LEAD_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean)
  return new Set(configured?.length ? configured : ["https://diskoov.fr", "https://www.diskoov.fr", "http://localhost:3000"])
}

function hasValidIntegrationSecret(request: Request) {
  const expected = process.env.LEAD_INGEST_SECRET?.trim()
  if (!expected) return false
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || ""
  const expectedHash = Buffer.from(hashLeadRequestValue(expected), "hex")
  const providedHash = Buffer.from(hashLeadRequestValue(provided), "hex")
  return expectedHash.length === providedHash.length && timingSafeEqual(expectedHash, providedHash)
}

function requestOrigin(request: Request) {
  return request.headers.get("origin")?.replace(/\/$/, "") || null
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin" })
  if (origin && allowedOrigins().has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin)
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS")
    headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
    headers.set("Access-Control-Max-Age", "600")
  }
  return headers
}

function isTrustedRequest(request: Request) {
  const origin = requestOrigin(request)
  return (origin !== null && allowedOrigins().has(origin)) || hasValidIntegrationSecret(request)
}

function clientAddress(request: Request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown"
}

async function requestPayload(request: Request) {
  const contentType = request.headers.get("content-type") || ""
  if (contentType.includes("application/json")) return request.json()
  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await request.formData()
    return Object.fromEntries(formData.entries())
  }
  throw new TypeError("Format attendu : JSON ou formulaire encodé.")
}

export async function OPTIONS(request: Request) {
  const origin = requestOrigin(request)
  if (!origin || !allowedOrigins().has(origin)) return new Response(null, { status: 403, headers: corsHeaders(origin) })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = requestOrigin(request)
  const headers = corsHeaders(origin)
  if (!isTrustedRequest(request)) return Response.json({ error: "Origine non autorisée." }, { status: 403, headers })

  const contentLength = Number(request.headers.get("content-length") || "0")
  if (contentLength > 64 * 1024) return Response.json({ error: "Requête trop volumineuse." }, { status: 413, headers })

  const ipHash = hashLeadRequestValue(clientAddress(request))
  const rateLimit = await leadRateLimit.limit(ipHash)
  headers.set("X-RateLimit-Limit", String(rateLimit.limit))
  headers.set("X-RateLimit-Remaining", String(rateLimit.remaining))
  if (!rateLimit.success) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1_000))))
    return Response.json({ error: "Trop de demandes. Réessayez plus tard." }, { status: 429, headers })
  }

  try {
    const payload = await requestPayload(request)
    if (payload && typeof payload === "object" && "website" in payload && typeof payload.website === "string" && payload.website.trim()) {
      return Response.json({ accepted: true }, { status: 202, headers })
    }
    const userAgent = request.headers.get("user-agent") || "unknown"
    const result = await capturePublicLead(payload, { ipHash, userAgentHash: hashLeadRequestValue(userAgent) })
    return Response.json(result, { status: result.duplicate ? 200 : 201, headers })
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: "Formulaire incomplet ou invalide.", fields: error.flatten().fieldErrors }, { status: 400, headers })
    }
    if (error instanceof TypeError) return Response.json({ error: error.message }, { status: 415, headers })
    if (error instanceof LeadConfigurationError) return Response.json({ error: "Capture de prospects non configurée." }, { status: 503, headers })
    console.error("Lead capture failed", error)
    return Response.json({ error: "Enregistrement temporairement indisponible." }, { status: 500, headers })
  }
}
