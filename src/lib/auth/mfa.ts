import "server-only"

import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/crypto"
import { hashRecoveryCode, verifyTotp } from "./mfa-core"

function recoveryPepper() {
  const value = process.env.AUTH_SECRET?.trim()
  if (!value) throw new Error("AUTH_SECRET est requis pour les codes de secours")
  return value
}

export async function verifyAndConsumeSecondFactor(input: {
  userId: string
  secretEncrypted: string | null
  code: string
}) {
  const code = input.code.trim()
  if (!code || !input.secretEncrypted) return false

  try {
    if (verifyTotp(decrypt(input.secretEncrypted), code)) return true
  } catch {
    // A damaged TOTP secret must not prevent a valid one-use recovery code.
  }

  const recovery = await prisma.mfaRecoveryCode.updateMany({
    where: {
      userId: input.userId,
      codeHash: hashRecoveryCode(input.userId, code, recoveryPepper()),
      usedAt: null,
    },
    data: { usedAt: new Date() },
  })
  return recovery.count === 1
}

export function recoveryCodeHashes(userId: string, codes: string[]) {
  const pepper = recoveryPepper()
  return codes.map((code) => ({ userId, codeHash: hashRecoveryCode(userId, code, pepper) }))
}
