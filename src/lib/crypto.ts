import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto"

const ALGORITHM = "aes-256-gcm"

if (!process.env.ENCRYPTION_KEY) {
  throw new Error("ENCRYPTION_KEY environment variable is required")
}

const KEY = scryptSync(process.env.ENCRYPTION_KEY, "salt", 32)

export function encrypt(text: string): string {
  const iv = randomBytes(16)
  const cipher = createCipheriv(ALGORITHM, KEY, iv)
  
  let encrypted = cipher.update(text, "utf8", "hex")
  encrypted += cipher.final("hex")
  
  const authTag = cipher.getAuthTag().toString("hex")
  
  // Format: iv:authTag:encryptedData
  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

export function decrypt(hash: string): string {
  const [ivHex, authTagHex, encryptedDataHex] = hash.split(":")
  
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, KEY, iv)
  
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedDataHex, "hex", "utf8")
  decrypted += decipher.final("utf8")
  
  return decrypted
}
