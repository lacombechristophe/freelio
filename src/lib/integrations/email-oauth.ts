import "server-only"

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { z } from "zod"

export const EMAIL_OAUTH_PROVIDERS = ["GOOGLE", "MICROSOFT"] as const
export type EmailOAuthProvider = (typeof EMAIL_OAUTH_PROVIDERS)[number]

const stateSchema = z.object({
  provider: z.enum(EMAIL_OAUTH_PROVIDERS),
  companyId: z.string().cuid(),
  userId: z.string().cuid(),
  channelId: z.string().cuid(),
  nonce: z.string().regex(/^[A-Za-z0-9_-]{32,}$/),
  expiresAt: z.number().int().positive(),
})

export type EmailOAuthState = z.infer<typeof stateSchema>

type OAuthTokenResponse = {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  token_type?: string
}

function signingSecret() {
  const secret = process.env.AUTH_SECRET?.trim() || process.env.ENCRYPTION_KEY?.trim()
  if (!secret) throw new Error("AUTH_SECRET ou ENCRYPTION_KEY est requis pour OAuth")
  return secret
}

function signature(payload: string) {
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url")
}

export function createEmailOAuthNonce() {
  return randomBytes(32).toString("base64url")
}

export function createEmailOAuthCodeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function createEmailOAuthState(input: Omit<EmailOAuthState, "expiresAt"> & { expiresAt?: number }) {
  const state = stateSchema.parse({ ...input, expiresAt: input.expiresAt ?? Date.now() + 10 * 60_000 })
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url")
  return `${payload}.${signature(payload)}`
}

export function verifyEmailOAuthState(value: string): EmailOAuthState {
  const [payload, providedSignature, extra] = value.split(".")
  if (!payload || !providedSignature || extra) throw new Error("État OAuth invalide")
  const expectedSignature = signature(payload)
  const expectedBytes = Buffer.from(expectedSignature)
  const providedBytes = Buffer.from(providedSignature)
  if (expectedBytes.length !== providedBytes.length || !timingSafeEqual(expectedBytes, providedBytes)) {
    throw new Error("État OAuth invalide")
  }
  const state = stateSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")))
  if (state.expiresAt < Date.now()) throw new Error("Autorisation OAuth expirée")
  return state
}

export function emailOAuthCookieName(provider: EmailOAuthProvider) {
  return `crm_email_oauth_${provider.toLowerCase()}`
}

export function canonicalIntegrationBaseUrl(request: Request) {
  const configured = process.env.PUBLIC_APP_URL?.trim() || process.env.AUTH_URL?.trim()
  if (configured) return new URL(configured).origin
  if (process.env.NODE_ENV === "production") throw new Error("PUBLIC_APP_URL est requis pour OAuth")
  return new URL(request.url).origin
}

export function emailOAuthRedirectUri(baseUrl: string) {
  return `${baseUrl}/api/integrations/email/oauth/callback`
}

function providerCredentials(provider: EmailOAuthProvider) {
  const clientId = (provider === "GOOGLE" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID)?.trim()
  const clientSecret = (provider === "GOOGLE" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET)?.trim()
  if (!clientId || !clientSecret) throw new Error(`${provider === "GOOGLE" ? "Google" : "Microsoft"} OAuth n’est pas configuré sur le serveur`)
  return { clientId, clientSecret }
}

export function isEmailOAuthConfigured(provider: EmailOAuthProvider) {
  try {
    providerCredentials(provider)
    return true
  } catch {
    return false
  }
}

export function buildEmailAuthorizationUrl(provider: EmailOAuthProvider, redirectUri: string, state: string, codeChallenge: string) {
  const { clientId } = providerCredentials(provider)
  const url = new URL(provider === "GOOGLE"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : "https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize")
  const scopes = provider === "GOOGLE"
    ? ["https://www.googleapis.com/auth/gmail.modify"]
    : ["openid", "profile", "offline_access", "User.Read", "Mail.ReadWrite", "Mail.Send"]
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", scopes.join(" "))
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  if (provider === "GOOGLE") {
    url.searchParams.set("access_type", "offline")
    url.searchParams.set("include_granted_scopes", "true")
    url.searchParams.set("prompt", "consent")
  } else {
    url.searchParams.set("response_mode", "query")
    url.searchParams.set("prompt", "select_account")
  }
  return url
}

export async function exchangeEmailAuthorizationCode(provider: EmailOAuthProvider, code: string, redirectUri: string, codeVerifier: string): Promise<OAuthTokenResponse> {
  const { clientId, clientSecret } = providerCredentials(provider)
  const endpoint = provider === "GOOGLE"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/organizations/oauth2/v2.0/token"
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code" }),
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({})) as Partial<OAuthTokenResponse> & { error_description?: string }
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Échange du code OAuth refusé")
  if (!payload.refresh_token) throw new Error("Le fournisseur n’a pas accordé l’accès hors ligne")
  return payload as OAuthTokenResponse
}

export async function refreshEmailOAuthAccessToken(provider: EmailOAuthProvider, refreshToken: string): Promise<OAuthTokenResponse> {
  const { clientId, clientSecret } = providerCredentials(provider)
  const endpoint = provider === "GOOGLE"
    ? "https://oauth2.googleapis.com/token"
    : "https://login.microsoftonline.com/organizations/oauth2/v2.0/token"
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({})) as Partial<OAuthTokenResponse> & { error_description?: string }
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || "Actualisation de l’autorisation refusée")
  return { ...payload, refresh_token: payload.refresh_token || refreshToken } as OAuthTokenResponse
}

export async function fetchEmailOAuthIdentity(provider: EmailOAuthProvider, accessToken: string) {
  const endpoint = provider === "GOOGLE"
    ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
    : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName"
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${accessToken}` }, cache: "no-store" })
  const payload = await response.json().catch(() => ({})) as { emailAddress?: string; mail?: string | null; userPrincipalName?: string; displayName?: string }
  if (!response.ok) throw new Error("Impossible de vérifier le compte autorisé")
  const addresses = [payload.emailAddress, payload.mail, payload.userPrincipalName].filter((value): value is string => Boolean(value)).map((value) => value.trim().toLowerCase())
  if (!addresses.length) throw new Error("Le fournisseur n’a retourné aucune adresse de messagerie")
  return { addresses, displayName: payload.displayName || null }
}
