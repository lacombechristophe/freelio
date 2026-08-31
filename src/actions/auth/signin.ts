"use server"

import { credentialsAuthEnabled, magicLinkAuthEnabled, signIn } from "@/auth"
import { AuthError } from "next-auth"
import { authRateLimit } from "@/lib/rate-limit"
import { headers } from "next/headers"

export type SignInState = {
  success: boolean
  error?: string
  method?: "password" | "magic"
}

export async function submitSignInWithEmail(
  _previousState: SignInState,
  formData: FormData
): Promise<SignInState> {
  return signInWithEmail(formData)
}

export async function signInWithEmail(formData: FormData) {
  const email = formData.get("email") as string
  const password = String(formData.get("password") ?? "")
  const mfaCode = String(formData.get("mfaCode") ?? "")
  const method: "magic" | "password" = formData.get("method") === "magic" ? "magic" : "password"
  const requestedRedirect = String(formData.get("redirectTo") ?? "")
  const redirectTo = requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
    ? requestedRedirect
    : "/onboarding"

  if (!email) {
    return { success: false, error: "L'adresse e-mail est requise." }
  }

  if (method === "magic" && !magicLinkAuthEnabled && !credentialsAuthEnabled) {
    return { success: false, method, error: "La connexion par lien n’est pas encore configurée. Utilisez votre mot de passe." }
  }
  if (method === "password" && !credentialsAuthEnabled && !password) {
    return { success: false, method, error: "Le mot de passe est requis." }
  }

  if (!credentialsAuthEnabled) {
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
      method === "magic" ? "resend" : "credentials",
      { email: email.trim().toLowerCase(), password, mfaCode, redirectTo }
    )
    return { success: true, method }
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { success: false, method, error: "Identifiants ou code de sécurité incorrects." }
      }
      return { success: false, method, error: "Une erreur est survenue lors de la connexion." }
    }
    throw error
  }
}
