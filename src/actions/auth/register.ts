"use server"

import { AuthError } from "next-auth"
import { headers } from "next/headers"
import { z } from "zod"

import { signIn } from "@/auth"
import { hashPassword, passwordIsStrong, passwordRequirements } from "@/lib/auth/password"
import prisma from "@/lib/prisma"
import { authRateLimit } from "@/lib/rate-limit"

export type RegisterState = { success: boolean; error?: string }

const registerSchema = z.object({
  name: z.string().trim().min(2, "Indiquez votre nom").max(100),
  email: z.string().trim().toLowerCase().email("Adresse e-mail invalide").max(254),
  password: z.string().max(128),
  confirmPassword: z.string().max(128),
  acceptTerms: z.literal("on", { error: "Vous devez accepter les conditions d’utilisation" }),
}).superRefine((data, context) => {
  if (!passwordIsStrong(data.password)) context.addIssue({ code: "custom", path: ["password"], message: `Le mot de passe doit contenir ${passwordRequirements}.` })
  if (data.password !== data.confirmPassword) context.addIssue({ code: "custom", path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas" })
})

export async function registerWithPassword(_previousState: RegisterState, formData: FormData): Promise<RegisterState> {
  const requestHeaders = await headers()
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  const limit = await authRateLimit.limit(`register:${ip}`)
  if (!limit.success) return { success: false, error: "Trop de tentatives. Réessayez dans 15 minutes." }

  const result = registerSchema.safeParse(Object.fromEntries(formData))
  if (!result.success) return { success: false, error: result.error.issues[0]?.message || "Informations invalides" }

  const existing = await prisma.user.findUnique({ where: { email: result.data.email }, select: { id: true } })
  if (existing) return { success: false, error: "Un compte existe déjà pour cette adresse. Connectez-vous ou utilisez le lien de connexion." }

  const passwordHash = await hashPassword(result.data.password)
  await prisma.user.create({
    data: {
      name: result.data.name,
      email: result.data.email,
      passwordHash,
    },
  })

  try {
    await signIn("credentials", { email: result.data.email, password: result.data.password, redirectTo: "/onboarding" })
    return { success: true }
  } catch (error) {
    if (error instanceof AuthError) return { success: false, error: "Le compte a été créé, mais la connexion a échoué. Réessayez depuis la page de connexion." }
    throw error
  }
}
