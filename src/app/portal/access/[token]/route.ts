import { NextResponse } from "next/server"

import prisma from "@/lib/prisma"
import { portalRateLimit } from "@/lib/rate-limit"
import {
  getPortalAccessFromToken,
  hashPortalToken,
  portalCookieOptions,
  portalTokenLooksValid,
  portalRequestUrl,
  PORTAL_SESSION_COOKIE,
} from "@/lib/portal/session"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const fingerprint = portalTokenLooksValid(token) ? hashPortalToken(token) : "invalid"
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown"
  const rateLimit = await portalRateLimit.limit(`${fingerprint}:${ip}`)
  if (!rateLimit.success) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 })

  const access = await getPortalAccessFromToken(token)
  if (!access) {
    const response = NextResponse.redirect(portalRequestUrl(request, "/portal?error=invalid"))
    response.cookies.delete(PORTAL_SESSION_COOKIE)
    response.headers.set("Cache-Control", "no-store")
    return response
  }

  await prisma.clientPortalAccess.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } })
  const response = NextResponse.redirect(portalRequestUrl(request, "/portal"))
  response.cookies.set(PORTAL_SESSION_COOKIE, token, portalCookieOptions(access.expiresAt))
  response.headers.set("Cache-Control", "no-store")
  response.headers.set("Referrer-Policy", "no-referrer")
  return response
}
