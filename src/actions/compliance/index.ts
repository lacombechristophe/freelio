"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"

// Account portability is separate from the administrator's company export.
// A user's old primary company must never select the business data to return.
export async function exportUserData() {
  return await withAuth(async ({ userId, companyId }) => {
    const [account, company] = await Promise.all([prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        auditLogs: { select: { id: true, action: true, createdAt: true } },
        notifications: { where: { companyId } },
      }
    }), prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true } })])

    await logAction({
      userId,
      action: "UPDATE_SETTINGS",
      resource: "USER",
      resourceId: userId,
      payload: { export: "ACCOUNT_DATA", companyId }
    })

    return {
      exportedAt: new Date().toISOString(),
      data: account ? { ...account, company } : null
    }
  })
}

/**
 * RGPD Anonymization (Art. 17).
 * Replaces personal data with "[Supprimé]" while keeping legal records (10-year retention).
 */
export async function anonymizeAccount() {
  return await withAuth(async ({ userId, companyId }) => {
    await Promise.all([
      // 1. Anonymize User
      prisma.user.update({
        where: { id: userId },
        data: {
          name: "[Supprimé]",
          email: `supprime-${userId}@anonymise.crm.local`,
          image: null,
          passwordHash: null,
          mfaSecretEncrypted: null,
          mfaEnabledAt: null,
          sessionVersion: { increment: 1 },
        },
      }),
      // 2. Anonymize Company personal data (SIRET/address kept for 10-year legal retention)
      prisma.company.update({
        where: { id: companyId },
        data: {
          fullName: "[Supprimé]",
          email: null,
          phone: null,
          logo: null,
          iban: null,
        },
      }),
      // 3. Anonymize Contacts
      prisma.contact.updateMany({
        where: { client: { companyId } },
        data: {
          firstName: "[Supprimé]",
          lastName: "[Supprimé]",
          email: null,
          phone: null,
        },
      }),
      prisma.passwordResetToken.deleteMany({ where: { userId } }),
      prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      prisma.session.deleteMany({ where: { userId } }),
    ])

    await logAction({
      userId,
      action: "UPDATE_SETTINGS",
      resource: "USER",
      resourceId: userId,
      payload: { gdpr: "ANONYMIZED" },
    })

    return { success: true }
  })
}
