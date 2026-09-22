import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(), findRun: vi.fn(), updateRun: vi.fn(), issueCount: vi.fn(),
  status: vi.fn(), download: vi.fn(), store: vi.fn(), manifest: vi.fn(), metric: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: mocks.withAuth }))
vi.mock("@/lib/crypto", () => ({ decrypt: (value: string) => value, encrypt: (value: string) => value }))
vi.mock("@/lib/prisma", () => ({ default: {
  migrationRun: { findFirst: mocks.findRun, updateMany: mocks.updateRun },
  migrationIssue: { count: mocks.issueCount }, documentManifest: { upsert: mocks.manifest }, migrationMetric: { update: mocks.metric },
} }))
vi.mock("@/lib/migrations/hubspot", () => ({ getHubSpotExportStatus: mocks.status, downloadHubSpotExport: mocks.download }))
vi.mock("@/lib/migrations/storage", () => ({ storeMigrationArtifact: mocks.store }))

import { refreshHubSpotSnapshot } from "@/actions/migrations"

const runId = "cm00000000000000000000001"
function run(tasks: Array<Record<string, unknown>>, status = "PROCESSING") {
  return { id: runId, status, updatedAt: new Date("2026-09-22T10:00:00Z"), checkpoint: { tasks }, connection: { provider: "HUBSPOT", credentialsEncrypted: JSON.stringify({ accessToken: "test-token" }) } }
}
function task(extra: Record<string, unknown> = {}) {
  return { objectType: "contacts", taskId: "export-1", status: "PENDING", downloaded: false, propertyCount: 1, ...extra }
}

describe("HubSpot snapshot completion", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.withAuth.mockImplementation((action) => action({ companyId: "company-a" }))
    mocks.issueCount.mockResolvedValue(0)
    mocks.updateRun.mockResolvedValue({ count: 1 })
    mocks.download.mockResolvedValue({ bytes: new TextEncoder().encode("id\n1\n"), mimeType: "text/csv", contentDisposition: null })
    mocks.store.mockResolvedValue({ fileName: "contacts.csv", size: 5, sha256: "digest", storageKey: "r2:test" })
  })

  it("does not call a snapshot complete when an object's export failed to start", async () => {
    mocks.findRun.mockResolvedValue(run([task({ downloaded: true, status: "COMPLETE" })]))
    mocks.issueCount.mockResolvedValue(1)
    await expect(refreshHubSpotSnapshot(runId)).resolves.toMatchObject({ finished: true, failed: 1, total: 2 })
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIAL" }) }))
    expect(mocks.issueCount).toHaveBeenCalledWith({ where: { runId, code: "HUBSPOT_EXPORT_START_FAILED" } })
    expect(mocks.findRun).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company-a" }) }))
  })

  it("never promotes an empty failed snapshot to complete", async () => {
    mocks.findRun.mockResolvedValue(run([], "FAILED"))
    await refreshHubSpotSnapshot(runId)
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }))
  })

  it("clears a transient error only after successful export processing", async () => {
    mocks.findRun.mockResolvedValue(run([task({ error: "Ancienne erreur réseau" })]))
    mocks.status.mockResolvedValue({ status: "COMPLETE", result: "https://example.test/export" })
    await expect(refreshHubSpotSnapshot(runId)).resolves.toMatchObject({ failed: 0, downloaded: 1 })
    const saved = mocks.updateRun.mock.calls[0][0].data
    expect(saved.status).toBe("COMPLETE")
    expect(saved.checkpoint.tasks[0]).not.toHaveProperty("error")
  })

  it("exposes provider-reported errors even if a result file exists", async () => {
    mocks.findRun.mockResolvedValue(run([task()]))
    mocks.status.mockResolvedValue({ status: "COMPLETE", result: "https://example.test/export", numErrors: 2 })
    await expect(refreshHubSpotSnapshot(runId)).resolves.toMatchObject({ failed: 1, downloaded: 1 })
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "PARTIAL" }) }))
  })

  it("does not overwrite a run already analyzed or imported", async () => {
    mocks.findRun.mockResolvedValue(run([task()], "VERIFIED"))
    await expect(refreshHubSpotSnapshot(runId)).rejects.toThrow(/actualis/i)
    expect(mocks.status).not.toHaveBeenCalled()
    expect(mocks.updateRun).not.toHaveBeenCalled()
  })

  it("does not query or write when permission is denied", async () => {
    mocks.withAuth.mockRejectedValue(new Error("Access denied"))
    await expect(refreshHubSpotSnapshot(runId)).rejects.toThrow("Access denied")
    expect(mocks.findRun).not.toHaveBeenCalled()
  })

  it("rejects a stale refresh instead of overwriting concurrent progress", async () => {
    const initial = run([task({ downloaded: true, status: "COMPLETE" })])
    mocks.findRun.mockResolvedValue(initial)
    mocks.updateRun.mockResolvedValue({ count: 0 })
    await expect(refreshHubSpotSnapshot(runId)).rejects.toThrow(/changé/)
    expect(mocks.updateRun).toHaveBeenCalledWith(expect.objectContaining({ where: { id: runId, companyId: "company-a", status: initial.status, updatedAt: initial.updatedAt } }))
  })

  it("keeps missing download URLs visible and retryable", async () => {
    mocks.findRun.mockResolvedValue(run([task()]))
    mocks.status.mockResolvedValue({ status: "COMPLETE" })
    await expect(refreshHubSpotSnapshot(runId)).resolves.toMatchObject({ finished: false, downloaded: 0, failed: 1 })
    expect(mocks.download).not.toHaveBeenCalled()
  })
})
