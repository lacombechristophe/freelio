import { Prisma } from "@prisma/client"
import type { RequestContext } from "@/lib/context"

/** Unknown legacy ownership is fail-closed for ordinary members. */
export function mailboxScope(model: string, context: RequestContext): Record<string, unknown> | null {
  // Drafts are personal even when using a shared mailbox or an admin account.
  if (model === "EmailDraft") return { companyId: context.companyId, authorUserId: context.userId }
  if (["OWNER", "ADMIN"].includes(context.role)) return null
  const channel = { companyId: context.companyId, OR: [{ visibility: "SHARED" }, { visibility: "PRIVATE", ownerUserId: context.userId }] }
  if (model === "CommunicationChannel") return channel
  if (model === "EmailThread") return { channel: { is: channel } }
  if (model === "EmailMessage") return { thread: { channel: { is: channel } } }
  if (model === "EmailEvent") return { message: { thread: { channel: { is: channel } } } }
  if (model === "EmailDelivery") return { channel: { is: channel } }
  if (model === "AutomationEventOutbox") return { OR: [{ channelId: null }, { channel: { is: channel } }] }
  if (model === "OrganisationTask") return { OR: [{ calendarChannelId: null, calendarProvider: null, calendarExternalId: null }, { calendarChannel: { is: channel } }] }
  return null
}

/** Nested includes bypass Prisma query extensions unless scoped explicitly. */
export function scopeMailboxIncludes(model: string, args: Record<string, any>, context: RequestContext) {
  const definition = Prisma.dmmf.datamodel.models.find((item) => item.name === model)
  for (const projection of [args.include, args.select]) {
    if (!projection || typeof projection !== "object") continue
    if (projection._count === true) projection._count = { select: Object.fromEntries((definition?.fields || []).filter((field) => field.kind === "object" && field.isList).map((field) => [field.name, true])) }
    for (const field of definition?.fields || []) {
      if (field.kind !== "object" || !projection[field.name]) continue
      const scope = mailboxScope(field.type, context)
      if (scope) {
        const nested = projection[field.name] === true ? {} : projection[field.name]
        const and = nested.where?.AND
        nested.where = { ...nested.where, AND: [...(Array.isArray(and) ? and : and ? [and] : []), scope] }
        projection[field.name] = nested
      }
      if (typeof projection[field.name] === "object") scopeMailboxIncludes(field.type, projection[field.name], context)
    }
    const counts = projection._count?.select
    for (const field of definition?.fields || []) {
      const scope = counts?.[field.name] && mailboxScope(field.type, context)
      if (scope) {
        const existing = counts[field.name] === true ? {} : counts[field.name]
        counts[field.name] = { ...existing, where: { AND: [existing.where || {}, scope] } }
      }
    }
  }
}
