import { afterEach, beforeEach, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ images: vi.fn(), launch: vi.fn(), fonts: vi.fn() }))
vi.mock("@/lib/pdf/images", () => ({ inlineSafePdfImages: mocks.images }))
vi.mock("puppeteer", () => ({ default: { launch: mocks.launch } }))
vi.mock("node:fs/promises", () => ({ readFile: mocks.fonts }))
let generatePdfFromHtml: typeof import("@/lib/pdf/generator").generatePdfFromHtml

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  mocks.fonts.mockResolvedValue(Buffer.from("fictional bundled font"))
  ;({ generatePdfFromHtml } = await import("@/lib/pdf/generator"))
})
afterEach(() => { vi.restoreAllMocks() })

function pendingImage() {
  mocks.images.mockImplementation((_html: string, signal?: AbortSignal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true })
  }))
}

it("bounds image preparation even when the caller supplies no cancellation signal", async () => {
  const deadline = new AbortController()
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
  pendingImage()
  const failed = vi.fn()
  const operation = generatePdfFromHtml("<p>Fictional image waiting for DNS</p>").catch(failed)
  await vi.waitFor(() => expect(mocks.images).toHaveBeenCalled())
  const reason = new DOMException("Fictional render deadline", "TimeoutError")
  deadline.abort(reason)
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(reason), { timeout: 200 })
  await operation
  expect(mocks.launch).not.toHaveBeenCalled()
})

it("preserves the caller's earlier cancellation while a default deadline is also active", async () => {
  const deadline = new AbortController(), caller = new AbortController()
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
  pendingImage()
  const failed = vi.fn()
  const operation = generatePdfFromHtml("<p>Fictional canceled request</p>", { signal: caller.signal }).catch(failed)
  await vi.waitFor(() => expect(mocks.images).toHaveBeenCalled())
  const reason = new Error("Fictional request disconnected")
  caller.abort(reason)
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(reason))
  await operation
  expect(deadline.signal.aborted).toBe(false)
  expect(mocks.launch).not.toHaveBeenCalled()
})

it("does not allow an explicit live signal to disable the renderer's own deadline", async () => {
  const deadline = new AbortController(), caller = new AbortController()
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
  pendingImage()
  const failed = vi.fn()
  const operation = generatePdfFromHtml("<p>Fictional unresponsive resource</p>", { signal: caller.signal }).catch(failed)
  await vi.waitFor(() => expect(mocks.images).toHaveBeenCalled())
  const reason = new DOMException("Fictional maximum render duration", "TimeoutError")
  deadline.abort(reason)
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(reason), { timeout: 200 })
  await operation
  expect(caller.signal.aborted).toBe(false)
  expect(mocks.launch).not.toHaveBeenCalled()
})

it("stops waiting for font preparation when the rendering deadline expires", async () => {
  const deadline = new AbortController()
  vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal)
  mocks.fonts.mockImplementation(() => new Promise(() => {}))
  const failed = vi.fn()
  const operation = generatePdfFromHtml("<p>Fictional waiting font</p>").catch(failed)
  await vi.waitFor(() => expect(mocks.fonts).toHaveBeenCalled())
  const reason = new DOMException("Fictional font deadline", "TimeoutError")
  deadline.abort(reason)
  await vi.waitFor(() => expect(failed).toHaveBeenCalledWith(reason), { timeout: 200 })
  await operation
  expect(mocks.images).not.toHaveBeenCalled()
  expect(mocks.launch).not.toHaveBeenCalled()
})
