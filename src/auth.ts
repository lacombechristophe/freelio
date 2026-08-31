import NextAuth from "next-auth"
import { createHash } from "node:crypto"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"
import Resend from "next-auth/providers/resend"
import Credentials from "next-auth/providers/credentials"
import { MagicLinkEmail } from "@/emails/MagicLinkEmail"
import { render } from "@react-email/render"
import { verifyPassword } from "@/lib/auth/password"
import { verifyAndConsumeSecondFactor } from "@/lib/auth/mfa"
import { authRateLimit } from "@/lib/rate-limit"
import logger from "@/lib/logger"

const emailFrom = process.env.EMAIL_FROM?.trim() || "CRM <noreply@example.invalid>"
const ciCredentialsAuth = process.env.GITHUB_ACTIONS === "true" && process.env.E2E_ENABLE_CREDENTIALS_AUTH === "true" && Boolean(process.env.E2E_USER_EMAIL)

// The production server is used by CI to avoid flaky cold compilation. This
// provider is impossible to enable outside CI and only accepts the seeded QA address.
export const credentialsAuthEnabled = process.env.NODE_ENV === "development" || ciCredentialsAuth
export const magicLinkAuthEnabled = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.EMAIL_FROM?.trim())

function requestAddress(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown"
}

function emailRateLimitKey(email: string) {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex")
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    ...(magicLinkAuthEnabled
      ? [
          Resend({
            apiKey: process.env.RESEND_API_KEY,
            from: emailFrom,
            async sendVerificationRequest({ identifier: email, url }) {
              if (process.env.NODE_ENV === "development") {
                console.log(`[Dev] Magic Link: ${url}`)
                return
              }

              const limit = await authRateLimit.limit(`magic:${emailRateLimitKey(email)}`)
              if (!limit.success) throw new Error("Magic link rate limit exceeded")

              const host = new URL(url).host
              const origin = new URL(url).origin
              const user = await prisma.user.findUnique({
                where: { email },
                select: { company: { select: { name: true } } },
              })
              const appName = user?.company?.name || "Freelio"
              const emailHtml = await render(MagicLinkEmail({ url, host, appName, homeUrl: origin }))
              const res = await fetch("https://api.resend.com/emails", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                },
                body: JSON.stringify({
                  from: emailFrom,
                  to: email,
                  subject: `Connexion à ${appName}`,
                  html: emailHtml,
                }),
              })

              if (!res.ok) {
                throw new Error("Resend error")
              }
            },
          }),
        ]
      : []),
    Credentials({
      id: "credentials",
      name: "Email et mot de passe",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
        mfaCode: { label: "Code de sécurité", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email) return null
        const email = String(credentials.email).trim().toLowerCase()
        const password = typeof credentials.password === "string" ? credentials.password : ""
        const mfaCode = typeof credentials.mfaCode === "string" ? credentials.mfaCode : ""
        if (ciCredentialsAuth && !password && email !== process.env.E2E_USER_EMAIL?.toLowerCase()) return null

        try {
          if (!credentialsAuthEnabled) {
            const limit = await authRateLimit.limit(`credentials:${requestAddress(request)}`)
            if (!limit.success) return null
          }
          if (credentialsAuthEnabled && !password) {
            return prisma.user.upsert({
              where: { email },
              update: {},
              create: { email, name: email.split("@")[0], emailVerified: new Date() },
            })
          }
          const user = await prisma.user.findUnique({ where: { email } })
          if (!user || !(await verifyPassword(password, user.passwordHash))) return null
          if (
            user.mfaEnabledAt &&
            !(await verifyAndConsumeSecondFactor({
              userId: user.id,
              secretEncrypted: user.mfaSecretEncrypted,
              code: mfaCode,
            }))
          )
            return null
          return user
        } catch (error) {
          logger.warn(
            {
              event: "credentials_authorization_failed",
              errorName: error instanceof Error ? error.name : "UnknownError",
              errorMessage: error instanceof Error ? error.message : "Unknown authentication error",
            },
            "Credentials authorization failed before identity verification completed",
          )
          return null
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "resend" || !user.email) return true
      const security = await prisma.user.findUnique({ where: { email: user.email }, select: { mfaEnabledAt: true } })
      return !security?.mfaEnabledAt
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { companyId: true, sessionVersion: true },
        })
        token.companyId = dbUser?.companyId ?? null
        token.sessionVersion = dbUser?.sessionVersion ?? 0
        return token
      }
      if (token.sub) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { companyId: true, sessionVersion: true },
        })
        if (!dbUser || token.sessionVersion !== dbUser.sessionVersion) {
          token.sessionInvalid = true
          delete token.sub
          token.companyId = null
        } else {
          token.companyId = dbUser.companyId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.sessionInvalid || !token.sub) return { ...session, user: undefined, companyId: null } as unknown as typeof session
      if (session.user) session.user.id = token.sub
      ;(session as any).companyId = token.companyId ?? null
      return session
    },
  },
})

// CRITICAL: Export GET and POST for the route.ts to pick up
export const { GET, POST } = handlers
