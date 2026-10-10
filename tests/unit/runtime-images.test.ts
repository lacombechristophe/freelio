import { expect, it, vi } from "vitest"
import { pullRuntimeImage } from "../../scripts/runtime-images.mjs"

function dependencies() {
  return {
    pull: vi.fn<(reference: string) => void>(),
    delay: vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined),
    record: vi.fn(),
  }
}

it("uses the primary pinned image without delay when available", async () => {
  const options = dependencies()
  const image = await pullRuntimeImage("postgres", options)
  expect(options.pull).toHaveBeenCalledExactlyOnceWith(image.reference)
  expect(image.reference).toMatch(/^public\.ecr\.aws\/docker\/library\/postgres@sha256:[a-f0-9]{64}$/)
  expect(options.delay).not.toHaveBeenCalled()
  expect(options.record).toHaveBeenCalledExactlyOnceWith({ reference: image.reference, attempt: 1, outcome: "available" })
})

it("retries a registry quota once before changing registry", async () => {
  const options = dependencies()
  options.pull.mockImplementationOnce(() => { throw Error("toomanyrequests: Rate exceeded") })
  const image = await pullRuntimeImage("redis", options)
  expect(options.pull.mock.calls.map(([reference]) => reference)).toEqual([image.reference, image.reference])
  expect(options.delay).toHaveBeenCalledExactlyOnceWith(5000)
  expect(options.record.mock.calls.map(([attempt]) => attempt.outcome)).toEqual(["rate-limited", "available"])
})

it("falls back to the identical official digest after two primary quota failures", async () => {
  const options = dependencies()
  options.pull.mockImplementationOnce(() => { throw Error("HTTP 429") })
    .mockImplementationOnce(() => { throw Error("rate limit exceeded") })
  const image = await pullRuntimeImage("redis", options)
  const references = options.pull.mock.calls.map(([reference]) => reference)
  expect(image.reference).toMatch(/^docker\.io\/library\/redis@sha256:/)
  expect(references[0]).toBe(references[1])
  expect(references[0].split("@")[1]).toBe(image.digest)
  expect(references[2]).toBe(image.reference)
  expect(options.record.mock.calls.map(([attempt]) => attempt.outcome)).toEqual(["rate-limited", "rate-limited", "available"])
})

it.each(["unauthorized: authentication required", "manifest unknown", "connection refused"])(
  "fails immediately on a non-quota error: %s", async message => {
    const options = dependencies()
    const error = Error(message)
    options.pull.mockImplementation(() => { throw error })
    await expect(pullRuntimeImage("postgres", options)).rejects.toBe(error)
    expect(options.pull).toHaveBeenCalledTimes(1)
    expect(options.delay).not.toHaveBeenCalled()
    expect(options.record).toHaveBeenCalledWith(expect.objectContaining({ outcome: "failed" }))
  },
)

it("fails closed after four quota failures with bounded delays and preserved attempts", async () => {
  const options = dependencies()
  options.pull.mockImplementation(() => { throw Error("toomanyrequests: Rate exceeded") })
  await expect(pullRuntimeImage("redis", options)).rejects.toThrow("les deux registres officiels")
  expect(options.pull).toHaveBeenCalledTimes(4)
  expect(options.delay.mock.calls).toEqual([[5000], [5000]])
  expect(options.record.mock.calls.map(([attempt]) => attempt.attempt)).toEqual([1, 2, 1, 2])
  expect(options.record.mock.calls.every(([attempt]) => attempt.outcome === "rate-limited")).toBe(true)
})
