import { expect, it } from "vitest"
import { Readable } from "node:stream"
import { readBoundedStream } from "@/lib/bounded-file-read"
it("stops reading an oversized stream and destroys its source", async () => {
  const source = Readable.from([Buffer.alloc(10), Buffer.alloc(10), Buffer.alloc(10)])
  await expect(readBoundedStream(source, 15)).rejects.toThrow("volumineux")
  expect(source.destroyed).toBe(true)
})
it("retains exact bytes for an allowed stream", async () => {
  expect(await readBoundedStream(Readable.from([Buffer.from("ab"), Buffer.from("cd")]), 4)).toEqual(Buffer.from("abcd"))
})
