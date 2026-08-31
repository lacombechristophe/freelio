import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"

import {
  buildEmailAuthorizationUrl,
  canonicalIntegrationBaseUrl,
  createEmailOAuthCodeChallenge,
  createEmailOAuthNonce,
  createEmailOAuthState,
  emailOAuthCookieName,
  emailOAuthRedirectUri,
  EMAIL_OAUTH_PROVIDERS,
} from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

const querySchema = z.object({ channelId: z.string().cuid() })

function failureRedirect(request: Request, code: string) {
  const url = new URL("/dashboard/communications", request.url)
  url.searchParams.set("tab", "integrations")
  url.searchParams.set("integrationError", code)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  return withRouteAuth("company.manage", async ({ companyId, userId }) => {
    try {
      const { channelId } = querySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
      const channel = await prisma.communicationChannel.findFirst({ where: { id: channelId, companyId, provider: { in: [...EMAIL_OAUTH_PROVIDERS] } }, select: { id: true, provider: true } })
      if (!channel || !EMAIL_OAUTH_PROVIDERS.includes(channel.provider as (typeof EMAIL_OAUTH_PROVIDERS)[number])) return failureRedirect(request, "channel_not_found")
      const provider = channel.provider as (typeof EMAIL_OAUTH_PROVIDERS)[number]
      const nonce = createEmailOAuthNonce()
      const codeVerifier = createEmailOAuthNonce()
      const state = createEmailOAuthState({ provider, companyId, userId, channelId: channel.id, nonce })
      const redirectUri = emailOAuthRedirectUri(canonicalIntegrationBaseUrl(request))
      const response = NextResponse.redirect(buildEmailAuthorizationUrl(provider, redirectUri, state, createEmailOAuthCodeChallenge(codeVerifier)))
      response.cookies.set(emailOAuthCookieName(provider), `${nonce}.${codeVerifier}`, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 10 * 60,
        path: "/api/integrations/email/oauth/callback",
      })
      return response
    } catch {
      return failureRedirect(request, "oauth_not_configured")
    }
  })
}
