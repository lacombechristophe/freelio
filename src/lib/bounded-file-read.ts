import { createReadStream } from "node:fs"

export async function readBoundedStream(source: AsyncIterable<Uint8Array> & { destroy?: () => void }, maxBytes: number) {
  let size = 0
  const chunks: Buffer[] = []
  try {
    for await (const chunk of source) {
      size += chunk.byteLength
      if (size > maxBytes) throw new Error("Fichier trop volumineux pour cet export logique")
      chunks.push(Buffer.from(chunk))
    }
    return Buffer.concat(chunks, size)
  } catch (error) { source.destroy?.(); throw error }
}
export function readBoundedFile(filePath: string, maxBytes: number) {
  return readBoundedStream(createReadStream(filePath), maxBytes)
}
