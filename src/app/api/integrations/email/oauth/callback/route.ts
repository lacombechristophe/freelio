import { NextResponse, type NextRequest } from "next/server"

import { logAction } from "@/lib/audit"
import { encrypt } from "@/lib/crypto"
import {
  canonicalIntegrationBaseUrl,
  emailOAuthCookieName,
  emailOAuthNonceHash,
  EMAIL_OAUTH_PROVIDERS,
  emailOAuthRedirectUri,
  exchangeEmailAuthorizationCode,
  fetchEmailOAuthIdentity,
  verifyEmailOAuthState,
} from "@/lib/integrations/email-oauth"
import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const runtime = "nodejs"

function dashboardRedirect(request: Request, key: "connected" | "integrationError", value: string) {
  const url = new URL("/dashboard/communications", request.url)
  url.searchParams.set("tab", "integrations")
  url.searchParams.set(key, value)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const result = await withRouteAuth("company.manage", async ({ companyId, userId }) => {
    let cookieName: string | null = null
    try {
      const providerError = request.nextUrl.searchParams.get("error")
      const code = request.nextUrl.searchParams.get("code")
      const rawState = request.nextUrl.searchParams.get("state")
      if (!rawState || (!code && !providerError)) return dashboardRedirect(request, "integrationError", providerError ? "consent_denied" : "missing_callback_data")
      const state = verifyEmailOAuthState(rawState)
      cookieName = emailOAuthCookieName(state.provider)
      const [nonce, codeVerifier] = request.cookies.get(cookieName)?.value.split(".") || []
      if (!nonce || !codeVerifier || nonce !== state.nonce || state.companyId !== companyId || state.userId !== userId) {
        return dashboardRedirect(request, "integrationError", "state_mismatch")
      }
      const channel = await prisma.communicationChannel.findFirst({ where: { id: state.channelId, companyId, provider: state.provider }, select: { id: true, emailAddress: true, mailEnabled: true, calendarEnabled: true } })
      if (!channel) return dashboardRedirect(request, "integrationError", "channel_not_found")

      const claimed = await prisma.communicationChannel.updateMany({ where: { id: channel.id, companyId, oauthStartedByUserId: userId, oauthNonceHash: emailOAuthNonceHash(nonce), oauthExpiresAt: { gt: new Date() } }, data: { oauthNonceHash: null, oauthExpiresAt: null } })
      if (claimed.count !== 1) return dashboardRedirect(request, "integrationError", "state_mismatch")
      if (providerError) return dashboardRedirect(request, "integrationError", "consent_denied")
      if (!code) return dashboardRedirect(request, "integrationError", "missing_callback_data")

      const redirectUri = emailOAuthRedirectUri(canonicalIntegrationBaseUrl(request))
      const tokens = await exchangeEmailAuthorizationCode(state.provider, code, redirectUri, codeVerifier)
      const identity = await fetchEmailOAuthIdentity(state.provider, tokens.access_token, channel.mailEnabled)
      if (!identity.addresses.includes(channel.emailAddress.toLowerCase())) {
        throw new Error("Le compte autorisé ne correspond pas à l’adresse déclarée")
      }
      const expiresAt = new Date(Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000)
      const connected = await prisma.communicationChannel.updateMany({
        where: { id: channel.id, companyId, oauthStartedByUserId: userId, oauthNonceHash: null, oauthAttemptId: emailOAuthNonceHash(nonce), mailEnabled: channel.mailEnabled, calendarEnabled: channel.calendarEnabled },
        data: {
          oauthStartedByUserId: null,
          oauthAttemptId: null,
          status: "ACTIVE",
          credentialsEncrypted: encrypt(JSON.stringify({
            mode: "OAUTH",
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenType: tokens.token_type || "Bearer",
            scope: tokens.scope || "",
            expiresAt: expiresAt.toISOString(),
          })),
          config: { mode: "OAUTH", accountDisplayName: identity.displayName, grantedScopes: (tokens.scope || "").split(" ").filter(Boolean) },
          lastError: null,
          lastSyncAt: null,
        },
      })
      if (connected.count !== 1) throw new Error("La connexion a changé pendant l’autorisation")
      await logAction({ userId, action: "UPDATE_COMMUNICATION_CHANNEL", resource: "COMMUNICATION_CHANNEL", resourceId: channel.id, payload: { operation: "CONNECT_OAUTH", provider: state.provider, emailAddress: channel.emailAddress } })
      const response = dashboardRedirect(request, "connected", state.provider.toLowerCase())
      response.cookies.delete(cookieName)
      return response
    } catch (error) {
      const response = dashboardRedirect(request, "integrationError", error instanceof Error && error.message.includes("correspond") ? "account_mismatch" : "oauth_failed")
      if (cookieName) response.cookies.delete(cookieName)
      return response
    }
  })
  const response = new NextResponse(result.body, { status: result.status, headers: result.headers })
  for (const provider of EMAIL_OAUTH_PROVIDERS) response.cookies.set(emailOAuthCookieName(provider), "", { expires: new Date(0), maxAge: 0, path: "/api/integrations/email/oauth/callback", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" })
  return response
}
