import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

function decodeBase32(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, "")
  let bits = ""
  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index < 0) throw new Error("Secret MFA invalide")
    bits += index.toString(2).padStart(5, "0")
  }
  const bytes: number[] = []
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2))
  }
  return Buffer.from(bytes)
}

function encodeBase32(bytes: Buffer) {
  let bits = ""
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0")
  let encoded = ""
  for (let offset = 0; offset < bits.length; offset += 5) {
    encoded += BASE32_ALPHABET[Number.parseInt(bits.slice(offset, offset + 5).padEnd(5, "0"), 2)]
  }
  return encoded
}

export function generateMfaSecret() {
  return encodeBase32(randomBytes(20))
}

export function generateTotp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000)
  const counterBuffer = Buffer.alloc(8)
  counterBuffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac("sha1", decodeBase32(secret)).update(counterBuffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, "0")
}

export function verifyTotp(secret: string, code: string, timestamp = Date.now(), window = 1) {
  const normalized = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(normalized)) return false
  const actual = Buffer.from(normalized)
  for (let step = -window; step <= window; step += 1) {
    const expected = Buffer.from(generateTotp(secret, timestamp + step * 30_000))
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) return true
  }
  return false
}

export function normalizeRecoveryCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

export function generateRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(12)
    const characters = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("")
    return `${characters.slice(0, 4)}-${characters.slice(4, 8)}-${characters.slice(8, 12)}`
  })
}

export function hashRecoveryCode(userId: string, code: string, pepper: string) {
  return createHmac("sha256", pepper).update(`${userId}\0${normalizeRecoveryCode(code)}`).digest("hex")
}
