"use server"

import { credentialsAuthEnabled, signIn } from "@/auth"
import { AuthError } from "next-auth"
import { authRateLimit } from "@/lib/rate-limit"
import { headers } from "next/headers"

export type SignInState = {
  success: boolean
  error?: string
}

export async function submitSignInWithEmail(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  return signInWithEmail(formData)
}

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string
  const requestedRedirect = String(formData.get("redirectTo") ?? "")
  const redirectTo = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : "/onboarding"

  if (!email) {
    return { success: false, error: "L'adresse e-mail est requise." }
  }

  const isLocalCredentials = credentialsAuthEnabled
  if (!isLocalCredentials) {
    // Rate limit by IP to prevent brute-force on the public auth endpoint.
    const headersList = await headers()
    const ip = headersList.get("x-forwarded-for") ?? headersList.get("x-real-ip") ?? "unknown"

    const { success } = await authRateLimit.limit(ip)
    if (!success) {
      return { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." }
    }
  }

  try {
    await signIn(
      credentialsAuthEnabled ? "credentials" : "resend",
      { email, redirectTo }
    )
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { success: false, error: "Identifiants invalides." }
      }
      return { success: false, error: "Une erreur est survenue lors de la connexion." }
    }
    throw error
  }
}
