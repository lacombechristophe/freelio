import { EventEmitter } from "node:events"
import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }))
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }))
vi.mock("node:https", () => ({ get: mocks.get }))
import { fetchPublicPdfImage, isPublicImageAddress, inlineSafePdfImages } from "@/lib/pdf/images"

describe("PDF image network boundary", () => {
  beforeEach(() => { vi.resetAllMocks() })
  it.each(["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "192.168.1.1", "::1", "::ffff:127.0.0.1", "fd00::1", "2001:db8::1"])("refuses non-public address %s", address => {
    expect(isPublicImageAddress(address)).toBe(false)
  })
  it("refuses all-private and mixed DNS answers before opening a socket", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 }])
    await expect(fetchPublicPdfImage("https://logo.example.test/logo.png")).rejects.toThrow("DESTINATION_REFUSED")
    expect(mocks.get).not.toHaveBeenCalled()
  })
  it("pins the validated DNS address and embeds a legitimate image", async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
    mocks.get.mockImplementation((_url, options, onResponse) => {
      const callback = vi.fn()
      options.lookup("logo.example.test", {}, callback)
      expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4)
      const request = new EventEmitter()
      queueMicrotask(() => {
        const response = Object.assign(new EventEmitter(), { statusCode: 200, headers: {}, resume() {}, destroy() {} })
        onResponse(response)
        response.emit("data", png)
        response.emit("end")
      })
      return request
    })
    const html = await inlineSafePdfImages('<img src="https://logo.example.test/logo.png">')
    expect(html).toContain("data:image/png;base64,")
    expect(html).not.toContain("https://")
  })
  it("revalidates redirects instead of following a private destination", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }])
    mocks.get.mockImplementation((_url, _options, onResponse) => {
      queueMicrotask(() => onResponse({ statusCode: 302, headers: { location: "https://127.0.0.1/private" }, resume() {} }))
      return new EventEmitter()
    })
    await expect(fetchPublicPdfImage("https://logo.example.test/logo.png")).rejects.toThrow("DESTINATION_REFUSED")
    expect(mocks.get).toHaveBeenCalledTimes(1)
  })
  it("refuses credentials, non-TLS URLs and public directory traversal", async () => {
    await expect(fetchPublicPdfImage("http://logo.example.test/a")).rejects.toThrow("URL_REFUSED")
    await expect(fetchPublicPdfImage("https://user:pass@logo.example.test/a")).rejects.toThrow("URL_REFUSED")
    await expect(inlineSafePdfImages('<img src="/../private.txt">')).rejects.toThrow("PATH_REFUSED")
    expect(mocks.get).not.toHaveBeenCalled()
  })
})
