"use server"

import QRCode from "qrcode"
import { z } from "zod"

import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { encrypt, decrypt } from "@/lib/crypto"
import { generateMfaSecret, generateRecoveryCodes, verifyTotp } from "@/lib/auth/mfa-core"
import { recoveryCodeHashes, verifyAndConsumeSecondFactor } from "@/lib/auth/mfa"
import { hashPassword, passwordIsStrong, passwordRequirements, verifyPassword } from "@/lib/auth/password"
import prisma from "@/lib/prisma"

const passwordSchema = z.string().min(1).max(128)
const secondFactorSchema = z.string().trim().min(6).max(32)

async function authenticatedUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      mfaSecretEncrypted: true,
      mfaEnabledAt: true,
      company: { select: { name: true } },
    },
  })
  if (!user) throw new Error("Compte introuvable")
  return user
}

async function requirePassword(userId: string, password: string) {
  const user = await authenticatedUser(userId)
  if (!await verifyPassword(password, user.passwordHash)) throw new Error("Mot de passe actuel incorrect")
  return user
}

export async function beginMfaSetup(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({ password: passwordSchema }).parse(input)
    const user = await requirePassword(userId, data.password)
    if (user.mfaEnabledAt) throw new Error("La double authentification est déjà active")

    const secret = generateMfaSecret()
    await prisma.user.update({ where: { id: userId }, data: { mfaSecretEncrypted: encrypt(secret) } })
    const issuer = user.company?.name || "Freelio"
    const label = user.email || "compte"
    const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${label}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`
    const qrCodeDataUrl = await QRCode.toDataURL(uri, { errorCorrectionLevel: "M", margin: 1, width: 220 })
    return { success: true as const, secret, qrCodeDataUrl }
  })
}

export async function confirmMfaSetup(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({ code: secondFactorSchema }).parse(input)
    const user = await authenticatedUser(userId)
    if (user.mfaEnabledAt) throw new Error("La double authentification est déjà active")
    if (!user.mfaSecretEncrypted || !verifyTotp(decrypt(user.mfaSecretEncrypted), data.code)) {
      throw new Error("Code temporaire invalide")
    }

    const recoveryCodes = generateRecoveryCodes()
    await prisma.$transaction(async (transaction) => {
      const enabled = await transaction.user.updateMany({
        where: { id: userId, mfaEnabledAt: null, mfaSecretEncrypted: { not: null } },
        data: { mfaEnabledAt: new Date() },
      })
      if (enabled.count !== 1) throw new Error("La configuration MFA a changé. Recommencez.")
      await transaction.mfaRecoveryCode.deleteMany({ where: { userId } })
      await transaction.mfaRecoveryCode.createMany({ data: recoveryCodeHashes(userId, recoveryCodes) })
    })
    await logAction({ userId, action: "ENABLE_MFA", resource: "USER_SECURITY", resourceId: userId })
    return { success: true as const, recoveryCodes }
  })
}

export async function rotateMfaRecoveryCodes(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({ code: secondFactorSchema }).parse(input)
    const user = await authenticatedUser(userId)
    if (!user.mfaEnabledAt || !await verifyAndConsumeSecondFactor({ userId, secretEncrypted: user.mfaSecretEncrypted, code: data.code })) {
      throw new Error("Code de sécurité invalide")
    }
    const recoveryCodes = generateRecoveryCodes()
    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      prisma.mfaRecoveryCode.createMany({ data: recoveryCodeHashes(userId, recoveryCodes) }),
    ])
    await logAction({ userId, action: "ROTATE_MFA_RECOVERY_CODES", resource: "USER_SECURITY", resourceId: userId })
    return { success: true as const, recoveryCodes }
  })
}

export async function disableMfa(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({ password: passwordSchema, code: secondFactorSchema }).parse(input)
    const user = await requirePassword(userId, data.password)
    if (!user.mfaEnabledAt || !await verifyAndConsumeSecondFactor({ userId, secretEncrypted: user.mfaSecretEncrypted, code: data.code })) {
      throw new Error("Code de sécurité invalide")
    }
    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      prisma.user.update({
        where: { id: userId },
        data: { mfaEnabledAt: null, mfaSecretEncrypted: null, sessionVersion: { increment: 1 } },
      }),
      prisma.session.deleteMany({ where: { userId } }),
    ])
    await logAction({ userId, action: "DISABLE_MFA", resource: "USER_SECURITY", resourceId: userId })
    return { success: true as const, signedOut: true as const }
  })
}

export async function changePassword(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({
      currentPassword: passwordSchema,
      newPassword: z.string().max(128),
      confirmPassword: z.string().max(128),
    }).parse(input)
    if (data.newPassword !== data.confirmPassword) throw new Error("Les nouveaux mots de passe ne correspondent pas")
    if (!passwordIsStrong(data.newPassword)) throw new Error(`Le mot de passe doit contenir ${passwordRequirements}.`)
    const user = await requirePassword(userId, data.currentPassword)
    if (await verifyPassword(data.newPassword, user.passwordHash)) throw new Error("Choisissez un mot de passe différent de l’ancien")
    const passwordHash = await hashPassword(data.newPassword)
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
      prisma.passwordResetToken.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
    ])
    await logAction({ userId, action: "CHANGE_PASSWORD", resource: "USER_SECURITY", resourceId: userId })
    return { success: true as const, signedOut: true as const }
  })
}

export async function revokeAllSessions(input: unknown) {
  return withAuth(async ({ userId }) => {
    const data = z.object({ password: passwordSchema }).parse(input)
    await requirePassword(userId, data.password)
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } }),
      prisma.session.deleteMany({ where: { userId } }),
    ])
    await logAction({ userId, action: "REVOKE_SESSIONS", resource: "USER_SECURITY", resourceId: userId })
    return { success: true as const, signedOut: true as const }
  })
}
