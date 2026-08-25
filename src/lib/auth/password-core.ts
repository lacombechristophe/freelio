import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"

const KEY_LENGTH = 64
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }

function derivePassword(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, derivedKey) => error ? reject(error) : resolve(derivedKey))
  })
}

export const passwordRequirements = "12 caractères minimum, avec une majuscule, une minuscule et un chiffre"

export function passwordIsStrong(password: string) {
  return password.length >= 12 && password.length <= 128 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password)
}

export async function hashPassword(password: string) {
  if (!passwordIsStrong(password)) throw new Error(`Le mot de passe doit contenir ${passwordRequirements}.`)
  const salt = randomBytes(16)
  const derived = await derivePassword(password, salt)
  return `scrypt$v1$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`
}

export async function verifyPassword(password: string, encoded: string | null | undefined) {
  if (!encoded || password.length > 128) return false
  const parts = encoded.split("$")
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "v1") return false
  const [, , rawN, rawR, rawP, saltValue, hashValue] = parts
  if (Number(rawN) !== SCRYPT_OPTIONS.N || Number(rawR) !== SCRYPT_OPTIONS.r || Number(rawP) !== SCRYPT_OPTIONS.p) return false
  try {
    const expected = Buffer.from(hashValue, "base64url")
    if (expected.length !== KEY_LENGTH) return false
    const actual = await derivePassword(password, Buffer.from(saltValue, "base64url"))
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
