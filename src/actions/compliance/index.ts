"use server"

import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"

/**
 * RGPD Export: Generates a complete JSON of all user data.
 * Must be completed under 10 minutes (L903).
 */
export async function exportUserData() {
  return await withAuth(async ({ userId }) => {
    const data = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        image: true,
        createdAt: true,
        updatedAt: true,
        aiUsageCount: true,
        company: {
          include: {
            clients: { include: { contacts: true, projects: true } },
            projects: { include: { timeEntries: true, milestones: true } },
            quotes: { include: { versions: true } },
            invoices: { include: { lines: true, payments: true } },
            expenses: { include: { files: true } },
            pipelines: { include: { opportunities: true } }
          }
        },
        auditLogs: true,
        notifications: true,
      }
    })

    await logAction({
      userId,
      action: "UPDATE_SETTINGS", // Using existing enum or extending
      resource: "USER",
      resourceId: userId,
      payload: { export: "RGPD_COMPLETE" }
    })

    return {
      exportedAt: new Date().toISOString(),
      data
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
