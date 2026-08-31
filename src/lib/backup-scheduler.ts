import "server-only"

import { promisify } from "node:util"
import { gzip as gzipCallback } from "node:zlib"

import { buildBackupPayload } from "@/lib/backup"
import { encryptBytes } from "@/lib/crypto"
import { storeMigrationArtifact } from "@/lib/migrations/storage"
import prisma from "@/lib/prisma"

const gzip = promisify(gzipCallback)

export async function processDueCompanyBackups(limit = 3) {
  const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)))
  const startOfToday = new Date()
  startOfToday.setUTCHours(0, 0, 0, 0)
  const due = await prisma.company.findMany({
    where: { OR: [{ lastBackupAt: null }, { lastBackupAt: { lt: startOfToday } }] },
    select: {
      id: true,
      lastBackupAt: true,
      memberships: { where: { status: "ACTIVE" }, orderBy: [{ role: "asc" }, { createdAt: "asc" }], take: 1, select: { userId: true } },
    },
    orderBy: { lastBackupAt: "asc" },
    take: boundedLimit,
  })

  const summary = { selected: due.length, stored: 0, failed: 0 }
  for (const company of due) {
    const requestedByUserId = company.memberships[0]?.userId
    if (!requestedByUserId) {
      summary.failed += 1
      continue
    }
    const claimedAt = new Date()
    const claim = await prisma.company.updateMany({
      where: {
        id: company.id,
        ...(company.lastBackupAt ? { lastBackupAt: company.lastBackupAt } : { lastBackupAt: null }),
      },
      data: { lastBackupAt: claimedAt },
    })
    if (claim.count !== 1) continue

    try {
      const payload = await buildBackupPayload(requestedByUserId, company.id)
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
      summary.stored += 1
    } catch (error) {
      summary.failed += 1
      await prisma.company.updateMany({ where: { id: company.id, lastBackupAt: claimedAt }, data: { lastBackupAt: company.lastBackupAt } })
      console.error("Durable logical backup failed", { companyId: company.id, error: error instanceof Error ? error.message : "unknown" })
    }
  }
  return summary
}
