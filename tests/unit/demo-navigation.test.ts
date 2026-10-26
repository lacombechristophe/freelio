import { afterEach, expect, it, vi } from "vitest"
import { NextRequest, type NextFetchEvent } from "next/server"

vi.mock("next-auth", () => ({ default: () => ({ auth: (handler: unknown) => handler }) }))
vi.mock("@/auth.config", () => ({ authConfig: {} }))
import proxy from "@/proxy"
import { DEMO_READ_ONLY_MESSAGE } from "@/lib/demo-policy"

afterEach(() => vi.unstubAllEnvs())

it.each(["/dashboard/factures/fake/edit", "/dashboard/contrats/fake/amend", "/auth/register", "/portal/fake"])("explains forbidden page navigation without exposing a JSON response: %s", async path => {
  vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
  const response = await proxy(new NextRequest(`https://demo.example.test${path}`), {} as NextFetchEvent)
  if (!response) throw new Error("Le refus de navigation doit fournir une réponse")
  expect(response.status).toBe(307)
  expect(response.headers.get("location")).toBe("https://demo.example.test/demo/lecture-seule")
  expect(response.headers.get("cache-control")).toBe("no-store")
})

it.each([
  ["/api/backup/export", "GET"], ["/api/public/leads", "POST"],
  ["/dashboard/factures/fake/edit", "POST"], ["/auth/register", "POST"],
])("keeps API and mutation refusals unchanged for %s %s", async (path, method) => {
  vi.stubEnv("DEMO_ACCESS_MODE", "readonly")
  const response = await proxy(new NextRequest(`https://demo.example.test${path}`, { method, headers: { accept: "text/html" } }), {} as NextFetchEvent)
  if (!response) throw new Error("Le refus de mutation doit fournir une réponse")
  expect(response.status).toBe(403)
  expect(response.headers.get("location")).toBeNull()
  expect(await response.json()).toEqual({ error: DEMO_READ_ONLY_MESSAGE })
})
