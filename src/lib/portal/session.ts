import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"

import prisma from "@/lib/prisma"

export const PORTAL_SESSION_COOKIE = "crm_portal_session"

export function createPortalToken() {
  return randomBytes(32).toString("base64url")
}

export function hashPortalToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

export function portalTokenLooksValid(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
}

export function portalCookieOptions(expires: Date) {
  const configuredUrl = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL
  const secure = configuredUrl ? configuredUrl.startsWith("https://") : process.env.NODE_ENV === "production"
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    expires,
    priority: "high" as const,
  }
}

export async function getPortalAccessFromToken(token: string) {
  if (!portalTokenLooksValid(token)) return null
  const now = new Date()
  return prisma.clientPortalAccess.findFirst({
    where: { tokenHash: hashPortalToken(token), revokedAt: null, expiresAt: { gt: now } },
    include: {
      company: { select: { id: true, name: true, logo: true, brandColor: true, email: true, phone: true } },
      client: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  })
}

export async function getCurrentPortalAccess() {
  const token = (await cookies()).get(PORTAL_SESSION_COOKIE)?.value
  return token ? getPortalAccessFromToken(token) : null
}

export function isSameOriginPortalRequest(request: Request) {
  const origin = request.headers.get("origin")
  if (!origin) return false
  try {
    return new URL(origin).host === portalRequestUrl(request, "/").host
  } catch {
    return false
  }
}

export function portalRequestUrl(request: Request, pathname: string) {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
  const host = forwardedHost || request.headers.get("host")
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim()
  const protocol = forwardedProtocol === "https" || forwardedProtocol === "http" ? forwardedProtocol : new URL(request.url).protocol.replace(":", "")
  if (host && /^[A-Za-z0-9.:[\]-]+$/.test(host)) return new URL(pathname, `${protocol}://${host}`)
  return new URL(pathname, request.url)
}
