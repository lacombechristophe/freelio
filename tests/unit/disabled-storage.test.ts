import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ io: vi.fn(), send: vi.fn(), sign: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("node:fs/promises", async importOriginal => ({
  ...await importOriginal<typeof import("node:fs/promises")>(),
  mkdir: mocks.io, readFile: mocks.io, writeFile: mocks.io, rm: mocks.io, open: mocks.io,
}))
vi.mock("@aws-sdk/client-s3", async importOriginal => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = mocks.send },
}))
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: mocks.sign }))

import {
  abortDirectFileUpload, confirmDirectFileUpload, createDirectFileUpload, directFileUploadAvailable,
  listR2CompanyObjects, localFilesRoot, readLocalFile, removeLocalFile, resolveLocalFile, storeFileBytes,
} from "@/lib/local-files"
import {
  confirmMigrationArtifactUpload, createMigrationArtifactUpload, migrationDirectUploadAvailable,
  readMigrationArtifact, storeMigrationArtifact,
} from "@/lib/migrations/storage"

const file = {
  companyId: "company-a", kind: "client" as const, resourceId: "client-a", originalName: "test.pdf",
  type: "application/pdf", size: 8, sha256: "a".repeat(64),
}
const migration = { companyId: "company-a", runId: "run-a", provider: "csv", fileName: "test.csv" }

describe("disabled persistent storage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true")
    vi.stubEnv("NEXT_PUBLIC_DEMO_READ_ONLY", "true")
    vi.stubEnv("FILE_STORAGE_DRIVER", "disabled")
    vi.stubEnv("MIGRATION_STORAGE_DRIVER", "disabled")
    // Existing credentials must not silently re-enable S3 access.
    vi.stubEnv("R2_ACCOUNT_ID", "a".repeat(32))
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-access")
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret")
    vi.stubEnv("R2_BUCKET_NAME", "test-bucket")
  })
  afterEach(() => {
    expect(mocks.io).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.sign).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it("does not advertise either direct upload capability", () => {
    expect(directFileUploadAvailable()).toBe(false)
    expect(migrationDirectUploadAvailable()).toBe(false)
  })

  it.each([
    ["store document", () => storeFileBytes({ ...file, bytes: Buffer.from("%PDF-1.7") })],
    ["presign document", () => createDirectFileUpload(file)],
    ["confirm document", () => confirmDirectFileUpload({ ...file, storageKey: "r2:_pending/company-a/client/client-a/test.pdf" })],
    ["abort upload", () => abortDirectFileUpload({ ...file, storageKey: "r2:_pending/company-a/client/client-a/test.pdf" })],
    ["read local document", () => readLocalFile("local:company-a/client/test.pdf")],
    ["read R2 document", () => readLocalFile("r2:company-a/client/test.pdf")],
    ["delete local document", () => removeLocalFile("local:company-a/client/test.pdf")],
    ["delete R2 document", () => removeLocalFile("r2:company-a/client/test.pdf")],
    ["list R2 documents", () => listR2CompanyObjects("company-a")],
    ["store migration", () => storeMigrationArtifact({ ...migration, bytes: Buffer.from("test") })],
    ["presign migration", () => createMigrationArtifactUpload({ ...migration, contentType: "text/csv", size: 4, sha256: "a".repeat(64) })],
    ["confirm migration", () => confirmMigrationArtifactUpload({ ...migration, storageKey: "r2:company-a/run-a/csv/test.csv", expectedSize: 4, expectedSha256: "a".repeat(64) })],
    ["read local migration", () => readMigrationArtifact("local:company-a/run-a/test.csv")],
    ["read R2 migration", () => readMigrationArtifact("r2:company-a/run-a/test.csv")],
  ])("refuses %s before filesystem, provider or presigner access", async (_name, operation) => {
    await expect(operation()).rejects.toThrow("stockage persistant est désactivé")
  })

  it("does not provide a path for callers to bypass the disabled driver", () => {
    expect(() => localFilesRoot()).toThrow("stockage persistant est désactivé")
    expect(() => resolveLocalFile("local:company-a/test.pdf")).toThrow("stockage persistant est désactivé")
  })

  it("fails closed when disabled storage is accidentally configured in writable production", async () => {
    vi.stubEnv("DEMO_ACCESS_MODE", "editable")
    await expect(storeFileBytes({ ...file, bytes: Buffer.from("%PDF-1.7") })).rejects.toThrow("stockage persistant est désactivé")
    await expect(readLocalFile("local:company-a/test.pdf")).rejects.toThrow("stockage persistant est désactivé")
    await expect(storeMigrationArtifact({ ...migration, bytes: Buffer.from("test") })).rejects.toThrow("stockage persistant est désactivé")
  })
})
