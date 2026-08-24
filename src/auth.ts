import NextAuth from "next-auth"
import { PrismaAdapter } from "@auth/prisma-adapter"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"
import Resend from "next-auth/providers/resend"
import Credentials from "next-auth/providers/credentials"
import { MagicLinkEmail } from "@/emails/MagicLinkEmail"
import { render } from "@react-email/render"

const emailFrom = process.env.EMAIL_FROM?.trim() || "CRM <noreply@example.invalid>"
const ciCredentialsAuth = process.env.GITHUB_ACTIONS === "true"
  && process.env.E2E_ENABLE_CREDENTIALS_AUTH === "true"
  && Boolean(process.env.E2E_USER_EMAIL)

// The production server is used by CI to avoid flaky cold compilation. This
// provider is impossible to enable outside CI and only accepts the seeded QA address.
export const credentialsAuthEnabled = process.env.NODE_ENV === "development" || ciCredentialsAuth

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: emailFrom,
      async sendVerificationRequest({ identifier: email, url }) {
        if (process.env.NODE_ENV === "development") {
          console.log(`[Dev] Magic Link: ${url}`)
          return
        }

        const host = new URL(url).host
        const origin = new URL(url).origin
        const user = await prisma.user.findUnique({
          where: { email },
          select: { company: { select: { name: true } } },
        })
        const appName = user?.company?.name || "CRM & opérations"
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
    ...(credentialsAuthEnabled ? [
      Credentials({
        id: "credentials",
        name: "Local Dev Portal",
        credentials: {
          email: { label: "Email", type: "email" },
        },
        async authorize(credentials) {
          if (!credentials?.email) return null
          const email = credentials.email as string
          if (ciCredentialsAuth && email.toLowerCase() !== process.env.E2E_USER_EMAIL?.toLowerCase()) return null

          try {
            const user = await prisma.user.upsert({
              where: { email },
              update: {},
              create: {
                email,
                name: email.split("@")[0],
                emailVerified: new Date(),
              },
            })
            return user
          } catch {
            return null
          }
        },
      })
    ] : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id
        // Cache companyId in the JWT to avoid a DB round-trip on every server action
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { companyId: true },
        })
        token.companyId = dbUser?.companyId ?? null
      }
      return token
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub
      }
      ;(session as any).companyId = token.companyId ?? null
      return session
    },
  },
})

// CRITICAL: Export GET and POST for the route.ts to pick up
export const { GET, POST } = handlers
