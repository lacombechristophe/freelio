"use server"

import { render } from "@react-email/render"
import { headers } from "next/headers"
import { z } from "zod"

import { PasswordResetEmail } from "@/emails/PasswordResetEmail"
import { logAction } from "@/lib/audit"
import { hashPassword, passwordIsStrong, passwordRequirements } from "@/lib/auth/password"
import { createPasswordResetToken, hashPasswordResetToken, passwordResetExpiresAt } from "@/lib/auth/reset-token"
import prisma from "@/lib/prisma"
import { passwordResetRateLimit } from "@/lib/rate-limit"

export type PasswordResetState = { success: boolean; message?: string; error?: string }

const genericRequestMessage = "Si cette adresse correspond à un compte, un lien valable 30 minutes vient d’être envoyé."

function publicAppUrl() {
  const value = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL
  if (!value) {
    if (process.env.NODE_ENV === "production") throw new Error("PUBLIC_APP_URL est requis")
    return "http://127.0.0.1:3000"
  }
  return new URL(value).origin
}

export async function requestPasswordReset(
  _previousState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = z.email().max(254).safeParse(String(formData.get("email") || "").trim().toLowerCase())
  if (!parsed.success) return { success: false, error: "Adresse e-mail invalide" }

  const requestHeaders = await headers()
  const ip = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown"
  const limit = await passwordResetRateLimit.limit(`${ip}:${parsed.data}`)
  if (!limit.success) return { success: true, message: genericRequestMessage }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data },
    select: { id: true, email: true, company: { select: { name: true } } },
  })
  const resendKey = process.env.RESEND_API_KEY?.trim()
  const emailFrom = process.env.EMAIL_FROM?.trim()
  if (!user?.email || (process.env.NODE_ENV === "production" && (!resendKey || !emailFrom))) {
    return { success: true, message: genericRequestMessage }
  }

  const token = createPasswordResetToken()
  const resetToken = await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({ where: { userId: user.id, OR: [{ usedAt: { not: null } }, { expiresAt: { lte: new Date() } }] } })
    return transaction.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashPasswordResetToken(token), expiresAt: passwordResetExpiresAt() },
      select: { id: true },
    })
  })
  const resetUrl = `${publicAppUrl()}/auth/reset-password/${token}`

  try {
    if (process.env.NODE_ENV === "development" && !resendKey) {
      console.log(`[Dev] Réinitialisation du mot de passe : ${resetUrl}`)
    } else {
      const subject = `Réinitialisation de votre mot de passe ${user.company?.name || "Freelio"}`
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: emailFrom,
          to: user.email,
          subject,
          html: await render(PasswordResetEmail({ url: resetUrl, appName: user.company?.name || "Freelio" })),
        }),
      })
      if (!response.ok) throw new Error(`Resend ${response.status}`)
      await prisma.emailLog.create({ data: { to: user.email, subject, template: "PASSWORD_RESET", status: "SENT" } })
    }
    await logAction({ userId: user.id, action: "REQUEST_PASSWORD_RESET", resource: "USER_SECURITY", resourceId: user.id, ipAddress: ip })
  } catch (error) {
    await prisma.passwordResetToken.deleteMany({ where: { id: resetToken.id } })
    await prisma.emailLog.create({
      data: { to: user.email, subject: "Réinitialisation du mot de passe", template: "PASSWORD_RESET", status: "FAILED", error: error instanceof Error ? error.message.slice(0, 240) : "Envoi impossible" },
    }).catch(() => undefined)
  }
  return { success: true, message: genericRequestMessage }
}

export async function resetPassword(
  _previousState: PasswordResetState,
  formData: FormData,
): Promise<PasswordResetState> {
  const parsed = z.object({
    token: z.string().min(32).max(200),
    password: z.string().max(128),
    confirmPassword: z.string().max(128),
  }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: "Lien ou formulaire invalide" }
  if (parsed.data.password !== parsed.data.confirmPassword) return { success: false, error: "Les mots de passe ne correspondent pas" }
  if (!passwordIsStrong(parsed.data.password)) return { success: false, error: `Le mot de passe doit contenir ${passwordRequirements}.` }

  const passwordHash = await hashPassword(parsed.data.password)
  const now = new Date()
  try {
    const userId = await prisma.$transaction(async (transaction) => {
      const token = await transaction.passwordResetToken.findUnique({
        where: { tokenHash: hashPasswordResetToken(parsed.data.token) },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      })
      if (!token || token.usedAt || token.expiresAt <= now) throw new Error("RESET_TOKEN_INVALID")
      const consumed = await transaction.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      })
      if (consumed.count !== 1) throw new Error("RESET_TOKEN_INVALID")
      await transaction.user.update({ where: { id: token.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } })
      await transaction.passwordResetToken.updateMany({ where: { userId: token.userId, usedAt: null }, data: { usedAt: now } })
      await transaction.session.deleteMany({ where: { userId: token.userId } })
      return token.userId
    }, { isolationLevel: "Serializable" })
    await logAction({ userId, action: "RESET_PASSWORD", resource: "USER_SECURITY", resourceId: userId })
    return { success: true, message: "Mot de passe modifié. Vous pouvez maintenant vous connecter." }
  } catch {
    return { success: false, error: "Ce lien est invalide, expiré ou déjà utilisé." }
  }
}
