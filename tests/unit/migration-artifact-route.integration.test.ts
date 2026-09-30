import { createHash } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ companyId: "", store: vi.fn(), confirm: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/route-auth", () => ({ withRouteAuth: vi.fn((_permission, action) => action({ companyId: state.companyId })) }))
vi.mock("@/lib/migrations/storage", () => ({
  migrationDirectUploadAvailable: vi.fn(() => false),
  createMigrationArtifactUpload: vi.fn(), confirmMigrationArtifactUpload: state.confirm,
  storeMigrationArtifact: state.store,
}))

import { POST } from "@/app/api/migrations/[runId]/artifacts/route"
import prisma from "@/lib/prisma"

describe("manual migration archive provenance", () => {
  const runIds: string[] = []
  const bytes = Buffer.from("name,email\nClient,client@example.test\n")

  beforeAll(async () => {
    const company = await prisma.company.create({ data: { name: `Archive QA ${Date.now()}` } })
    state.companyId = company.id
    for (let index = 0; index < 2; index += 1) {
      const run = await prisma.migrationRun.create({ data: { companyId: company.id, provider: "EXTRABAT", kind: "MANUAL_ARCHIVE", status: "PENDING" } })
      runIds.push(run.id)
    }
    state.store.mockImplementation(async (input) => ({
      fileName: input.fileName,
      size: input.bytes.byteLength,
      sha256: createHash("sha256").update(input.bytes).digest("hex"),
      storageKey: `local:${input.runId}/${input.fileName}`,
    }))
    state.confirm.mockResolvedValue({ size: bytes.length, mimeType: "text/csv" })
  })

  afterAll(async () => {
    if (state.companyId) await prisma.company.delete({ where: { id: state.companyId } })
  })

  it("keeps the same archive attached to both independent runs", async () => {
    for (const runId of runIds) {
      const form = new FormData()
      form.append("artifacts", new File([bytes], "contacts.csv", { type: "text/csv" }))
      const response = await POST(new Request(`https://app.example.test/api/migrations/${runId}/artifacts`, { method: "POST", body: form }), { params: Promise.resolve({ runId }) })
      expect(response.status).toBe(200)
    }
    for (const runId of runIds) {
      expect(await prisma.documentManifest.count({ where: { runId } })).toBe(1)
    }
  })

  it("keeps duplicate direct uploads attached to their own runs", async () => {
    const hash = createHash("sha256").update(bytes).digest("hex")
    const directRunIds: string[] = []
    for (let index = 0; index < 2; index += 1) {
      const run = await prisma.migrationRun.create({ data: { companyId: state.companyId, provider: "HUBSPOT", kind: "MANUAL_ARCHIVE", status: "PENDING" } })
      directRunIds.push(run.id)
      const response = await POST(new Request(`https://app.example.test/api/migrations/${run.id}/artifacts`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "complete", files: [{ name: "contacts.csv", size: bytes.length, type: "text/csv", sha256: hash, storageKey: `r2:${run.id}/contacts.csv` }] }),
      }), { params: Promise.resolve({ runId: run.id }) })
      expect(response.status).toBe(200)
    }
    for (const runId of directRunIds) expect(await prisma.documentManifest.count({ where: { runId } })).toBe(1)
  })
})
