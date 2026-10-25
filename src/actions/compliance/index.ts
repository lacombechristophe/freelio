"use server"

import prisma from "@/lib/prisma"
import { sqlTimestamp } from "@/lib/sql-timestamp"
import { withAuth } from "@/lib/auth-wrapper"
import { logAction } from "@/lib/audit"
import { Prisma } from "@/generated/prisma/client"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { lockCompanyOwnership } from "@/lib/auth/company-ownership"

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

// Personal departure must not erase the company's shared business records.
export async function anonymizeAccount() {
  assertDemoMutationAllowed()
  return withAuth(async ({ userId }) => {
    return prisma.$transaction(async tx => {
      // These cross-workspace statements are deliberately bound to the
      // authenticated user, never a user/company identifier from the browser.
      const memberships = await tx.$queryRaw<{ companyId: string }[]>`
        SELECT "companyId" FROM "Membership" WHERE "userId" = ${userId} AND "status" = 'ACTIVE' ORDER BY "companyId"`
      for (const { companyId } of memberships) await lockCompanyOwnership(tx, companyId)
      const lastOwner = await tx.$queryRaw<{ companyId: string }[]>`
        SELECT own."companyId" FROM "Membership" own
        WHERE own."userId" = ${userId} AND own."status" = 'ACTIVE' AND own."role" = 'OWNER'
        AND NOT EXISTS (SELECT 1 FROM "Membership" successor WHERE successor."companyId" = own."companyId"
          AND successor."status" = 'ACTIVE' AND successor."role" = 'OWNER' AND successor."userId" <> ${userId})`
      if (lastOwner.length) return { success: false as const, error: "Nommez un autre propriétaire dans chaque société avant de supprimer votre compte." }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } })
      await tx.user.update({
        where: { id: userId },
        data: {
          name: "[Supprimé]",
          email: `supprime-${userId}@anonymise.crm.local`,
          image: null,
          passwordHash: null,
          mfaSecretEncrypted: null,
          mfaEnabledAt: null,
          emailVerified: null,
          companyId: null,
          sessionVersion: { increment: 1 },
        },
      })
      await tx.account.deleteMany({ where: { userId } })
      await tx.passwordResetToken.deleteMany({ where: { userId } })
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } })
      await tx.session.deleteMany({ where: { userId } })
      if (user.email) await tx.verificationToken.deleteMany({ where: { identifier: user.email } })
      await tx.$executeRaw`DELETE FROM "ApiKey" WHERE "userId" = ${userId}`
      await tx.$executeRaw`DELETE FROM "Notification" WHERE "userId" = ${userId}`
      await tx.$executeRaw`DELETE FROM "EmailSignature" WHERE "authorUserId" = ${userId}`
      const now = new Date()
      await tx.$executeRaw`UPDATE "Membership" SET "status" = 'INACTIVE', "updatedAt" = ${sqlTimestamp(now)} WHERE "userId" = ${userId}`
      await tx.$executeRaw`UPDATE "CommunicationChannel" SET "status" = 'PENDING', "credentialsEncrypted" = NULL,
        "oauthNonceHash" = NULL, "oauthAttemptId" = NULL, "oauthExpiresAt" = NULL, "oauthStartedByUserId" = NULL,
        "config" = '{"mode":"DISCONNECTED"}', "lastSyncAt" = NULL, "syncAttemptCursor" = NULL,
        "lastError" = 'Déconnectée de Freelio ; l’accès fournisseur reste à révoquer', "updatedAt" = ${sqlTimestamp(now)}
        WHERE "ownerUserId" = ${userId}`
      await tx.$executeRaw`UPDATE "CommunicationChannel" SET "oauthNonceHash" = NULL, "oauthAttemptId" = NULL,
        "oauthExpiresAt" = NULL, "oauthStartedByUserId" = NULL, "updatedAt" = ${sqlTimestamp(now)} WHERE "oauthStartedByUserId" = ${userId}`
      // This audit is mandatory: failure rolls back the entire departure.
      await tx.auditLog.create({ data: { userId, action: "UPDATE_SETTINGS", resource: "USER", resourceId: userId, payload: { account: "DEACTIVATED" } } })
      return { success: true as const }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  })
}
