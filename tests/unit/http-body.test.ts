import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { PayloadTooLargeError, readJsonBody, readTextBody } from "@/lib/http-body"

describe("bounded HTTP body readers", () => {
  it("parses a JSON body within the byte budget", async () => {
    const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ ok: true }) })
    await expect(readJsonBody(request, 64)).resolves.toEqual({ ok: true })
  })

  it("rejects an oversized declared content length before reading", async () => {
    const request = new Request("https://example.test", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "small",
    })
    await expect(readTextBody(request, 64)).rejects.toBeInstanceOf(PayloadTooLargeError)
  })

  it("rejects an oversized streamed body without relying on content-length", async () => {
    const request = new Request("https://example.test", { method: "POST", body: "éééé" })
    await expect(readTextBody(request, 7)).rejects.toBeInstanceOf(PayloadTooLargeError)
  })
})
