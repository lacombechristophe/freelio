import { z } from "zod"

// Opaque mailbox-scoped identifiers, never derived from subjects or contacts.
export const providerConversationIdSchema = z.string().min(1).max(2048).regex(/^[\x21-\x7e]+$/)
export function providerConversationId(value: unknown): string | null {
  return value == null ? null : providerConversationIdSchema.parse(value)
}
