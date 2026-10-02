import "server-only"

import { lookup } from "node:dns/promises"
import { get, type RequestOptions } from "node:https"
import { BlockList, isIP } from "node:net"
import { readFile } from "node:fs/promises"
import path from "node:path"

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const blocked = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 3],
] as const) blocked.addSubnet(network, prefix, "ipv4")
blocked.addAddress("168.63.129.16", "ipv4")
const globalV6 = new BlockList()
globalV6.addSubnet("2000::", 3, "ipv6")
blocked.addSubnet("2001:db8::", 32, "ipv6")
blocked.addSubnet("2001::", 23, "ipv6")

export function isPublicImageAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, "ipv4")
  return family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6")
}

function imageType(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png"
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg"
  if (bytes.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/)) return "image/gif"
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  const svg = bytes.toString("utf8")
  if (/<svg\b/i.test(svg) && !/<script\b|<foreignObject\b|<!DOCTYPE|\bon\w+\s*=|\b(?:href|src)\s*=\s*["'](?:https?:|\/\/)/i.test(svg)) return "image/svg+xml"
  throw new Error("PDF_IMAGE_TYPE_INVALID")
}

export async function fetchPublicPdfImage(source: string, redirects = 0): Promise<Buffer> {
  const url = new URL(source)
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || redirects > 3) {
    throw new Error("PDF_IMAGE_URL_REFUSED")
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "")
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicImageAddress(address))) {
    throw new Error("PDF_IMAGE_DESTINATION_REFUSED")
  }
  const selected = addresses[0]
  return new Promise((resolve, reject) => {
    // Pin the validated address; a second DNS resolution must not bypass the check.
    const options: RequestOptions & { autoSelectFamily: boolean } = {
      family: selected.family, autoSelectFamily: false,
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
      timeout: 8_000,
    }
    const request = get(url, options, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume()
        fetchPublicPdfImage(new URL(response.headers.location, url).href, redirects + 1).then(resolve, reject)
        return
      }
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error("PDF_IMAGE_FETCH_FAILED"))
        return
      }
      if (Number(response.headers["content-length"]) > MAX_IMAGE_BYTES) {
        response.destroy()
        reject(new Error("PDF_IMAGE_TOO_LARGE"))
        return
      }
      const chunks: Buffer[] = []
      let size = 0
      response.on("data", chunk => {
        size += chunk.length
        if (size > MAX_IMAGE_BYTES) {
          response.destroy()
          reject(new Error("PDF_IMAGE_TOO_LARGE"))
        } else chunks.push(Buffer.from(chunk))
      })
      response.on("end", () => resolve(Buffer.concat(chunks)))
      response.on("error", reject)
    })
    request.on("timeout", () => request.destroy(new Error("PDF_IMAGE_TIMEOUT")))
    request.on("error", reject)
  })
}

export async function inlineSafePdfImages(html: string) {
  const images = [...html.matchAll(/(<img\b[^>]*?\bsrc=)(["'])([^"']+)\2/gi)]
  if (images.length > 20) throw new Error("PDF_IMAGE_LIMIT")
  const embedded = new Map<string, string>()
  for (const image of images) {
    const source = image[3].replaceAll("&amp;", "&")
    if (source.startsWith("data:")) continue
    if (!embedded.has(source)) {
      let bytes: Buffer
      if (source.startsWith("/") && !source.startsWith("//")) {
        const publicRoot = path.resolve(process.cwd(), "public")
        const imagePath = path.resolve(publicRoot, "." + source)
        if (!imagePath.toLowerCase().startsWith((publicRoot + path.sep).toLowerCase())) throw new Error("PDF_IMAGE_PATH_REFUSED")
        bytes = await readFile(imagePath)
      } else {
        bytes = await fetchPublicPdfImage(source)
      }
      if (bytes.length > MAX_IMAGE_BYTES) throw new Error("PDF_IMAGE_TOO_LARGE")
      embedded.set(source, `data:${imageType(bytes)};base64,${bytes.toString("base64")}`)
    }
    html = html.replace(image[0], image[1] + image[2] + embedded.get(source) + image[2])
  }
  return html
}
