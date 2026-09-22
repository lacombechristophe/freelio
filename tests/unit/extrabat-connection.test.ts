import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { testExtrabatConnection } from "@/lib/migrations/extrabat"

const fetchMock = vi.fn()
const config = { baseUrl: "https://api.example.test", testPath: "/account", authHeader: "Authorization", authScheme: "Bearer" }

describe("Extrabat connectivity is not an import authorization", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock)
    fetchMock.mockReset()
    vi.stubEnv("EXTRABAT_API_ALLOWED_ORIGINS", config.baseUrl)
  })
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it("rejects a login page with HTTP 200", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Connexion</html>", { headers: { "content-type": "text/html" } }))
    await expect(testExtrabatConnection("secret", config)).rejects.toThrow(/JSON/)
  })
  it("rejects malformed JSON", async () => {
    fetchMock.mockResolvedValue(new Response("not-json", { headers: { "content-type": "application/json" } }))
    await expect(testExtrabatConnection("secret", config)).rejects.toThrow(/JSON/)
  })
  it("reports only reachability for an unknown JSON API response", async () => {
    fetchMock.mockResolvedValue(Response.json({ account: "test" }))
    await expect(testExtrabatConnection("secret", config)).resolves.toMatchObject({ reachable: true, authorizationVerified: false, importAvailable: false })
    expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "error" }))
  })
  it("does not send a credential to a tenant-supplied unauthorized origin", async () => {
    await expect(testExtrabatConnection("secret", { ...config, baseUrl: "https://attacker.test" })).rejects.toThrow(/autoris/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("fails closed when the operator has not configured API origins", async () => {
    vi.stubEnv("EXTRABAT_API_ALLOWED_ORIGINS", "")
    await expect(testExtrabatConnection("secret", config)).rejects.toThrow(/autoris/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("rejects a cross-origin test path before transmitting the credential", async () => {
    await expect(testExtrabatConnection("secret", { ...config, testPath: "https://attacker.test" })).rejects.toThrow(/serveur/)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("preserves a provider permission failure instead of a success", async () => {
    fetchMock.mockResolvedValue(new Response("Denied", { status: 403 }))
    await expect(testExtrabatConnection("secret", config)).rejects.toThrow(/403/)
  })
})
