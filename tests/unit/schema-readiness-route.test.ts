import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ query: vi.fn(), schema: vi.fn(), configuration: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: mock.query } }))
vi.mock("@/lib/schema-readiness", () => ({ databaseSchemaReady: mock.schema }))
vi.mock("@/lib/readiness", () => ({ productionConfigurationIssues: mock.configuration }))
import { GET } from "@/app/api/health/ready/route"

describe("Readiness HTTP boundary", () => {
  beforeEach(() => {
    mock.query.mockReset().mockResolvedValue([{ "1": 1 }])
    mock.schema.mockReset().mockResolvedValue(true)
    mock.configuration.mockReset().mockReturnValue([])
  })
  afterEach(() => { vi.unstubAllEnvs() })
  it("requires connectivity, schema and configuration before reporting ready", async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: "ready", components: { database: "ok", schema: "ok", configuration: "ok" } })
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })
  it("does not run metadata queries after a connectivity failure", async () => {
    mock.query.mockRejectedValueOnce(new Error("postgresql://fictional:private-password@private-host.example.test/private-database"))
    const response = await GET(), body = await response.text()
    expect(response.status).toBe(503)
    expect(mock.schema).not.toHaveBeenCalled()
    for (const forbidden of ["password", "private-host", "private-database"]) expect(body).not.toContain(forbidden)
  })
  it("does not expose metadata errors, file paths or migration names", async () => {
    mock.schema.mockRejectedValueOnce(new Error("/private/directory/20300101000000_fictional/migration.sql _prisma_migrations"))
    const response = await GET(), body = await response.text()
    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toMatchObject({ components: { database: "ok", schema: "error" } })
    for (const forbidden of ["directory", "fictional", "migration", "stack"]) expect(body).not.toContain(forbidden)
  })
  it("refuses a mismatching schema while retaining the other component states", async () => {
    mock.schema.mockResolvedValueOnce(false)
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: "not_ready", components: { database: "ok", schema: "error", configuration: "ok" } })
  })
  it("never returns configured values or names in an invalid-configuration response", async () => {
    mock.configuration.mockReturnValueOnce(["FICTIONAL_SECRET_CONFIGURATION"])
    const response = await GET(), body = await response.text()
    expect(response.status).toBe(503)
    expect(JSON.parse(body)).toMatchObject({ components: { configuration: "error" } })
    expect(body).not.toContain("FICTIONAL_SECRET_CONFIGURATION")
  })
})
