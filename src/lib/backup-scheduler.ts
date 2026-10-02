import "server-only"

import { promisify } from "node:util"
import { randomUUID } from "node:crypto"
import { gzip as gzipCallback } from "node:zlib"

import { buildBackupPayload } from "@/lib/backup"
import { encryptBytes } from "@/lib/crypto"
import { storeMigrationArtifact } from "@/lib/migrations/storage"
import prisma from "@/lib/prisma"

const gzip = promisify(gzipCallback)

export async function processDueCompanyBackups(limit = 3, timeBudgetMs = 120_000) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)))
  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)
  const deadline = Date.now() + Math.max(1, Math.min(180_000, timeBudgetMs))
  const summary = { selected: 0, stored: 0, failed: 0, remaining: 0 }
  const visited: string[] = []
  while (Date.now() < deadline) {
    const staleLease = new Date(Date.now() - 5 * 60_000)
    const dueWhere = { AND: [
      { OR: [{ lastBackupAt: null }, { lastBackupAt: { lt: startOfToday } }] },
      { OR: [{ backupLeaseId: null }, { backupStartedAt: { lt: staleLease } }] },
    ] }
    const due = await prisma.company.findMany({
      where: { ...dueWhere, id: { notIn: visited } },
      select: {
        id: true,
        lastBackupAt: true,
        backupLeaseId: true,
        memberships: { where: { status: "ACTIVE" }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], take: 1, select: { userId: true } },
      },
      orderBy: [{ lastBackupAttemptAt: "asc" }, { id: "asc" }],
      take: boundedLimit,
    })

    if (!due.length) break
    summary.selected += due.length
    for (const company of due) {
      if (Date.now() >= deadline) break
      visited.push(company.id)
      const requestedByUserId = company.memberships[0]?.userId
      const claimedAt = new Date()
      const leaseId = randomUUID()
      const claim = await prisma.company.updateMany({
        where: {
          id: company.id,
          ...dueWhere,
          ...(company.lastBackupAt ? { lastBackupAt: company.lastBackupAt } : { lastBackupAt: null }),
        },
        data: { backupLeaseId: leaseId, backupStartedAt: claimedAt, lastBackupAttemptAt: claimedAt },
      })
      if (claim.count !== 1) continue

      try {
        if (!requestedByUserId) throw new Error("Aucun membre actif pour la sauvegarde")
        const payload = await buildBackupPayload(requestedByUserId, company.id)
        if (payload.manifest.status !== "COMPLETE") throw new Error("Sauvegarde partielle : fichiers absents, altérés ou inventaire incomplet")
        const compressed = await gzip(Buffer.from(JSON.stringify(payload), "utf8"), { level: 9 })
        const encrypted = encryptBytes(compressed)
        const date = claimedAt.toISOString().slice(0, 10)
        await storeMigrationArtifact({
          companyId: company.id,
          runId: `backup-${date}`,
          provider: "BACKUP",
          fileName: `logical-backup-${date}.json.gz.enc`,
          bytes: encrypted,
        })
        const completed = await prisma.company.updateMany({ where: { id: company.id, backupLeaseId: leaseId }, data: { lastBackupAt: new Date(), backupLeaseId: null, backupStartedAt: null } })
        if (completed.count !== 1) throw new Error("Réservation de sauvegarde expirée")
        summary.stored += 1
      } catch (error) {
        summary.failed += 1
        await prisma.company.updateMany({ where: { id: company.id, backupLeaseId: leaseId }, data: { backupLeaseId: null, backupStartedAt: null } })
        console.error("Durable logical backup failed", { companyId: company.id, error: error instanceof Error ? error.message : "unknown" })
      }
    }
  }
  summary.remaining = await prisma.company.count({ where: { OR: [{ lastBackupAt: null }, { lastBackupAt: { lt: startOfToday } }] } })
  return summary
}
