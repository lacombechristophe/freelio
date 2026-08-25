import { NextResponse } from "next/server"

import { isSameOriginPortalRequest, portalRequestUrl, PORTAL_SESSION_COOKIE } from "@/lib/portal/session"

export async function POST(request: Request) {
  if (!isSameOriginPortalRequest(request)) return NextResponse.json({ error: "Origine invalide" }, { status: 403 })
  const response = NextResponse.redirect(portalRequestUrl(request, "/portal"), { status: 303 })
  response.cookies.delete(PORTAL_SESSION_COOKIE)
  response.headers.set("Cache-Control", "no-store")
  return response
}
