import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"

export const authConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
      },
      async authorize() {
        // Validation logic is handled in the main auth.ts to avoid Edge Runtime issues
        return null
      },
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isDashboard = nextUrl.pathname.startsWith("/dashboard")
      const isOnboarding = nextUrl.pathname.startsWith("/onboarding")
      const isAuthPage = nextUrl.pathname.startsWith("/auth")
      
      if (isDashboard || isOnboarding) {
        if (isLoggedIn) return true
        return false // Redirect to login
      } else if (isLoggedIn && isAuthPage) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }
      return true
    },
  },
} satisfies NextAuthConfig
