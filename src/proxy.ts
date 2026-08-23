import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

export default NextAuth(authConfig).auth

export const config = {
  // Use 'proxy' instead of 'middleware' for Next.js 15.2+ / 16
  matcher: ["/((?!api|_next/static|_next/image|auth|logo\\.png|favicon.ico|.*\\.png$).*)"],
}
