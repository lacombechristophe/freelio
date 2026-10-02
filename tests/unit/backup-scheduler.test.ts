import { beforeEach, expect, it, vi } from "vitest"
const state = vi.hoisted(() => ({ companies: [] as Array<{ id: string; lastBackupAt: Date | null; backupLeaseId: string | null; backupStartedAt: Date | null; lastBackupAttemptAt: Date | null; memberships: Array<{ userId: string }> }> }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ default: { company: {
  findMany: vi.fn(async ({ where, take }) => state.companies.filter(c => !c.lastBackupAt && !where.id.notIn.includes(c.id) && !c.backupLeaseId).slice(0, take)),
  updateMany: vi.fn(async ({ where, data }) => {
    const company = state.companies.find(c => c.id === where.id && (!where.backupLeaseId || c.backupLeaseId === where.backupLeaseId))
    if (!company) return { count: 0 }
    Object.assign(company, data)
    return { count: 1 }
  }),
  count: vi.fn(async () => state.companies.filter(c => !c.lastBackupAt).length),
} } }))
vi.mock("@/lib/backup", () => ({ buildBackupPayload: vi.fn(async (_user, company) => {
  if (company === "c0") throw new Error("Synthetic storage failure")
  expect(state.companies.find(c => c.id === company)?.lastBackupAt).toBeNull()
  return { manifest: { status: company === "partial" ? "PARTIAL" : "COMPLETE" } }
}) }))
vi.mock("@/lib/crypto", () => ({ encryptBytes: (bytes: Buffer) => bytes }))
vi.mock("@/lib/migrations/storage", () => ({ storeMigrationArtifact: vi.fn(async () => ({})) }))
import { processDueCompanyBackups } from "@/lib/backup-scheduler"
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  state.companies = Array.from({ length: 7 }, (_, i) => ({ id: "c" + i, lastBackupAt: null, backupLeaseId: null, backupStartedAt: null, lastBackupAttemptAt: null, memberships: [{ userId: "synthetic-owner" }] }))
})
it("visits all due companies across batches and does not let a failure starve the others", async () => {
  await expect(processDueCompanyBackups(3)).resolves.toEqual({ selected: 7, stored: 6, failed: 1, remaining: 1 })
  expect(state.companies[0].lastBackupAt).toBeNull()
  expect(state.companies.every(c => c.backupLeaseId === null)).toBe(true)
})
it("keeps an incomplete export due and reports its failure", async () => {
  state.companies = [{ ...state.companies[0], id: "partial" }]
  await expect(processDueCompanyBackups()).resolves.toMatchObject({ stored: 0, failed: 1, remaining: 1 })
})
