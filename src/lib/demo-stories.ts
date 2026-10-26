import { createHash } from "node:crypto"

export function demoStoryId(companyId: string, key: string) {
  return `cdemo${createHash("sha256").update(`${companyId}:stories-v1:${key}`).digest("hex").slice(0, 24)}`
}
