import { afterEach, describe, expect, it, vi } from "vitest"
import { providerFetch, safeMicrosoftContinuation } from "@/lib/integrations/provider-fetch"

afterEach(() => vi.unstubAllGlobals())

describe("provider HTTP boundaries", () => {
  it("aborts a hanging request instead of retrying a mutation", async () => {
    const transport = vi.fn((_input, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true })
    }))
    vi.stubGlobal("fetch", transport)
    await expect(providerFetch("https://graph.microsoft.com/v1.0/me/messages", { method: "POST" }, 20)).rejects.toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0][1].redirect).toBe("error")
  })
  it("accepts only credential-free Graph continuations within the user's API", () => {
    expect(safeMicrosoftContinuation("https://graph.microsoft.com/v1.0/me/messages?$skiptoken=opaque")).toContain("$skiptoken=opaque")
    for (const url of ["http://graph.microsoft.com/v1.0/me/messages", "https://graph.microsoft.com.evil.test/v1.0/me/messages", "https://secret@graph.microsoft.com/v1.0/me/messages", "https://graph.microsoft.com/v1.0/users/another/messages", "https://graph.microsoft.com/v1.0/me/messages#secret"]) {
      expect(() => safeMicrosoftContinuation(url)).toThrow("Curseur Microsoft invalide")
    }
  })
})
