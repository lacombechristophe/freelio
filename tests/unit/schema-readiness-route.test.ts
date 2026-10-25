import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mock = vi.hoisted(() => ({ query: vi.fn(), schema: vi.fn(), configuration: vi.fn(), warn: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ default: { $queryRaw: mock.query } }))
vi.mock("@/lib/schema-readiness", () => ({ databaseSchemaReady: mock.schema }))
vi.mock("@/lib/readiness", () => ({ productionConfigurationIssues: mock.configuration }))
vi.mock("@/lib/logger", () => ({ default: { warn: mock.warn } }))
import { GET } from "@/app/api/health/ready/route"

describe("Readiness HTTP boundary", () => {
  beforeEach(() => {
    mock.query.mockReset().mockResolvedValue([{ "1": 1 }])
    mock.schema.mockReset().mockResolvedValue(true)
    mock.configuration.mockReset().mockReturnValue([])
    mock.warn.mockReset()
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
    expect(mock.warn).toHaveBeenCalledExactlyOnceWith({ event: "database_readiness_failed", errorCode: "unclassified", driverCode: "unclassified", driverKind: "unclassified" })
  })
  it.each([
    ["P2010", "SELF_SIGNED_CERT_IN_CHAIN", "TlsConnectionError"],
    ["P1001", "ECONNREFUSED", "DatabaseNotReachable"],
    ["P2010", "28P01", "AuthenticationFailed"],
  ])("logs only structured connectivity codes for %s/%s/%s", async (errorCode, driverCode, driverKind) => {
    const privateValue = "postgresql://fictional:private-password@private-host.example.test/private-database"
    mock.query.mockRejectedValueOnce({ code: errorCode, message: privateValue, stack: privateValue, meta: { database: privateValue, driverAdapterError: { cause: { originalCode: driverCode, kind: driverKind, originalMessage: privateValue, reason: privateValue } } } })
    const response = await GET(), body = await response.text()
    expect(response.status).toBe(503)
    expect(mock.warn).toHaveBeenCalledExactlyOnceWith({ event: "database_readiness_failed", errorCode, driverCode, driverKind })
    expect(mock.schema).not.toHaveBeenCalled()
    for (const forbidden of [privateValue, errorCode, driverCode, driverKind]) expect(body).not.toContain(forbidden)
  })
  it.each([null, undefined, { code: "private-password", meta: { driverAdapterError: { cause: { originalCode: "private-host", kind: "private-database" } } } }])("does not log arbitrary values or require a structured exception", async error => {
    mock.query.mockRejectedValueOnce(error)
    expect((await GET()).status).toBe(503)
    expect(mock.warn).toHaveBeenCalledExactlyOnceWith({ event: "database_readiness_failed", errorCode: "unclassified", driverCode: "unclassified", driverKind: "unclassified" })
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
