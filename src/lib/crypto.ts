import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

const ALGORITHM = "aes-256-gcm"
const FORMAT_VERSION = "v1"
const BINARY_MAGIC = Buffer.from("FREELIO1", "ascii")

let cachedSecret: string | undefined
let cachedKey: Buffer | undefined

function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_KEY
  if (!secret) {
    throw new Error("ENCRYPTION_KEY environment variable is required")
  }
  if (!cachedKey || cachedSecret !== secret) {
    cachedSecret = secret
    cachedKey = scryptSync(secret, "salt", 32)
  }
  return cachedKey
}

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  const authTag = cipher.getAuthTag().toString("hex")
  
  // Versioned envelope: future key rotation can coexist with existing data.
  return `${FORMAT_VERSION}:${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decrypt(hash: string): string {
  const parts = hash.split(":")
  const [ivHex, authTagHex, encryptedDataHex] = parts[0] === FORMAT_VERSION ? parts.slice(1) : parts
  if (!ivHex || !authTagHex || !encryptedDataHex || parts.length < 3) throw new Error("Encrypted value has an invalid envelope")
  
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedDataHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  
  return decrypted
}

export function isEncrypted(value: string | null | undefined): value is string {
  if (!value) return false
  const parts = value.split(":")
  const envelope = parts[0] === FORMAT_VERSION ? parts.slice(1) : parts
  return envelope.length === 3
    && /^[0-9a-f]{32}$/i.test(envelope[0])
    && /^[0-9a-f]{32}$/i.test(envelope[1])
    && /^[0-9a-f]+$/i.test(envelope[2])
}

/** Read legacy plaintext values while all new writes use authenticated encryption. */
export function decryptSensitive(value: string | null | undefined): string | null {
  if (!value) return null
  if (!isEncrypted(value)) return value
  return decrypt(value)
}

export function encryptBytes(bytes: Uint8Array): Uint8Array {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()])
  return Buffer.concat([BINARY_MAGIC, iv, cipher.getAuthTag(), encrypted])
}

export function decryptBytes(bytes: Uint8Array): Uint8Array {
  const payload = Buffer.from(bytes)
  if (payload.length < BINARY_MAGIC.length + 12 + 16 || !payload.subarray(0, BINARY_MAGIC.length).equals(BINARY_MAGIC)) {
    throw new Error("Encrypted binary value has an invalid envelope")
  }
  const ivStart = BINARY_MAGIC.length
  const tagStart = ivStart + 12
  const encryptedStart = tagStart + 16
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), payload.subarray(ivStart, tagStart))
  decipher.setAuthTag(payload.subarray(tagStart, encryptedStart))
  return Buffer.concat([decipher.update(payload.subarray(encryptedStart)), decipher.final()])
}
