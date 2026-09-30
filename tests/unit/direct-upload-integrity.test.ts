import { createHash } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

const mocks = vi.hoisted(() => ({ send: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  return { ...actual, S3Client: class { send = mocks.send } }
})

import { confirmDirectFileUpload } from "@/lib/local-files"

const bytes = Buffer.from("%PDF-1.7\nverified-content")
const input = {
  companyId: "company-a", resourceId: "project-a", kind: "project" as const,
  originalName: "devis.pdf", type: "application/pdf", size: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  storageKey: "r2:_pending/company-a/project/project-a/upload.pdf",
}

describe("direct upload publication integrity", () => {
  beforeEach(() => {
    mocks.send.mockReset()
    vi.stubEnv("FILE_STORAGE_DRIVER", "r2")
    vi.stubEnv("R2_ACCOUNT_ID", "a".repeat(32))
    vi.stubEnv("R2_ACCESS_KEY_ID", "test-access")
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "test-secret")
    vi.stubEnv("R2_BUCKET_NAME", "test-bucket")
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) return {
        ContentLength: bytes.length, ContentType: input.type,
        Metadata: { sha256: input.sha256, company: input.companyId, resource: input.resourceId, kind: input.kind },
      }
      if (command instanceof GetObjectCommand) return { Body: { transformToByteArray: async () => bytes } }
      return {}
    })
  })
  afterEach(() => vi.unstubAllEnvs())

  it("publishes the validated bytes rather than copying a mutable temporary object", async () => {
    const result = await confirmDirectFileUpload(input)
    const publication = mocks.send.mock.calls.map(([command]) => command).find((command) => command instanceof PutObjectCommand)
    expect(publication).toBeDefined()
    if (!publication) throw new Error("No verified bytes were published")
    expect(publication.input.Body).toEqual(bytes)
    expect(publication.input.Key).toBe("company-a/project/project-a/upload.pdf")
    expect(publication.input.Metadata?.sha256).toBe(input.sha256)
    expect(result.sha256).toBe(input.sha256)
    expect(mocks.send.mock.calls.at(-1)?.[0]).toBeInstanceOf(DeleteObjectCommand)
  })

  it("never deletes the temporary upload when publication fails", async () => {
    const previous = mocks.send.getMockImplementation()!
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand) throw new Error("R2 unavailable")
      return previous(command)
    })
    await expect(confirmDirectFileUpload(input)).rejects.toThrow("R2 unavailable")
    expect(mocks.send.mock.calls.some(([command]) => command instanceof DeleteObjectCommand)).toBe(false)
  })

  it("rejects changed bytes before publication", async () => {
    const previous = mocks.send.getMockImplementation()!
    mocks.send.mockImplementation(async (command) => command instanceof GetObjectCommand
      ? { Body: { transformToByteArray: async () => Buffer.alloc(bytes.length) } }
      : previous(command))
    await expect(confirmDirectFileUpload(input)).rejects.toThrow(/intégrité/)
    expect(mocks.send.mock.calls.some(([command]) => command instanceof PutObjectCommand || command instanceof DeleteObjectCommand)).toBe(false)
  })

  it("rejects a different tenant's temporary key before any storage request", async () => {
    await expect(confirmDirectFileUpload({ ...input, storageKey: input.storageKey.replace("company-a", "company-b") })).rejects.toThrow(/appartient/)
    expect(mocks.send).not.toHaveBeenCalled()
  })
})
