import "server-only"
import { createHash } from "node:crypto"
import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma, { type TransactionClient } from "@/lib/prisma"
import { getContext } from "@/lib/context"
import { assertDemoMutationAllowed } from "@/lib/demo-policy"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { copyRecipientsSchema, emailAddressSchema, validateRecipients } from "./recipients"

const channelKeySchema = z.union([z.literal("platform"), z.string().cuid()])
const policyInput = z.object({
  channelKey: channelKeySchema, version: z.number().int().nonnegative(), enabled: z.boolean(),
  dailyRecipientLimit: z.number().int().min(1).max(1_000_000),
  minuteRecipientLimit: z.number().int().min(1).max(1_000_000),
}).strict().refine(value => value.minuteRecipientLimit <= value.dailyRecipientLimit)

export class EmailSendQuotaError extends Error {
  constructor(message: string, readonly retryAt: Date | null = null) { super(message) }
}
export class EmailSendQuotaConflict extends Error {}
class QuotaStateConflict extends Error {}

type Tx = TransactionClient
type Identity = { companyId: string; channelKey: string }
type QuotaIntent = Identity & {
  deliveryId: string; from: string; to: string; cc?: string[]; bcc?: string[];
  subject: string; html: string; text?: string; replyTo?: string | null;
  headers?: Record<string, string>; reply?: unknown;
  attachments?: Array<{ id: string; name: string; size: number; type: string; sha256: string }>;
}
const periods = [{ name: "DAY", duration: 86_400_000 }, { name: "MINUTE", duration: 60_000 }] as const

async function assertMailbox(tx: Tx, identity: Identity) {
  channelKeySchema.parse(identity.channelKey)
  const context = getContext()
  if (context && context.companyId !== identity.companyId) throw new Error("Messagerie inaccessible")
  if (identity.channelKey === "platform") {
    if (context && !["OWNER", "ADMIN"].includes(context.role)) throw new Error("Messagerie inaccessible")
    return
  }
  if (!await tx.communicationChannel.count({ where: { companyId: identity.companyId, id: identity.channelKey } })) throw new Error("Messagerie inaccessible")
}

function channelId(channelKey: string) { return channelKey === "platform" ? null : channelKey }

async function readPolicy(tx: Tx, identity: Identity) {
  await assertMailbox(tx, identity)
  const policy = await tx.emailSendQuotaPolicy.findUnique({ where: { companyId_channelKey: identity } })
  if (policy && policy.channelId !== channelId(identity.channelKey)) throw new Error("Configuration de plafond incohérente")
  return policy
}

// Stable key ordering also applies to optional reply metadata and headers.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]))
  return value
}

function intentBinding(input: QuotaIntent) {
  const to = emailAddressSchema.parse(input.to)
  const cc = copyRecipientsSchema.parse(input.cc || []), bcc = copyRecipientsSchema.parse(input.bcc || [])
  validateRecipients(to, cc, bcc)
  const recipientUnits = new Set([to, ...cc, ...bcc].map(address => address.toLowerCase())).size
  const bindingHash = createHash("sha256").update(JSON.stringify(canonical({
    channelKey: input.channelKey, from: input.from, to, cc: [...cc].sort(), bcc: [...bcc].sort(),
    subject: input.subject, html: input.html, text: input.text, replyTo: input.replyTo || null,
    headers: input.headers || {}, reply: input.reply || null,
    attachments: (input.attachments || []).map(({ id, name, size, type, sha256 }) => ({ id, name, size, type, sha256 })),
  }))).digest("hex")
  return { to, recipientUnits, bindingHash }
}

async function quotaState(tx: Tx, identity: Identity, period: typeof periods[number], now: Date) {
  const state = await tx.emailSendQuotaState.findUnique({ where: { companyId_channelKey_period: { ...identity, period: period.name } } })
  if (state && state.channelId !== channelId(identity.channelKey)) throw new Error("Compteur de plafond incohérent")
  const floor = Math.floor(now.getTime() / period.duration) * period.duration
  // Rebuilding a missing cache never discards a later durable admission.
  const last = !state ? await tx.emailSendQuotaCharge.findFirst({ where: { ...identity, period: period.name }, orderBy: { windowStart: "desc" }, select: { windowStart: true } }) : null
  const windowStart = new Date(Math.max(floor, state?.windowStart.getTime() ?? last?.windowStart.getTime() ?? floor))
  const used = state && state.windowStart.getTime() === windowStart.getTime() ? state.used :
    (await tx.emailSendQuotaCharge.aggregate({ where: { ...identity, period: period.name, windowStart }, _sum: { recipientUnits: true } }))._sum.recipientUnits || 0
  return { period: period.name, duration: period.duration, windowStart, used, state }
}

async function serializable<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(operation, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }) }
    catch (error) {
      const retryable = error instanceof QuotaStateConflict || error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)
      if (!retryable || attempt >= 4) throw error
    }
  }
}

/** Reserves both windows, once per command/window. No provider request here. */
export async function reserveEmailSendQuota(input: QuotaIntent, now = new Date()) {
  assertDemoMutationAllowed()
  if (!Number.isFinite(now.getTime())) throw new Error("Date de plafond invalide")
  const identity = { companyId: input.companyId, channelKey: input.channelKey }
  const { to, recipientUnits, bindingHash } = intentBinding(input)
  return serializable(async tx => {
    const policy = await readPolicy(tx, identity)
    if (!policy?.enabled) throw new EmailSendQuotaError("Envoi suspendu : configurez et activez les plafonds internes de cette boîte")
    if (recipientUnits > Math.min(policy.dailyRecipientLimit, policy.minuteRecipientLimit)) throw new EmailSendQuotaError("Ce message dépasse le plafond interne de destinataires de la boîte")
    const delivery = await tx.emailDelivery.findFirst({ where: {
      id: input.deliveryId, companyId: input.companyId, channelId: channelId(input.channelKey), status: "SENDING", closedAt: null, sentAt: null, providerId: null,
      quotaCharges: { every: { companyId: input.companyId, channelKey: input.channelKey, channelId: channelId(input.channelKey), bindingHash, recipientUnits } },
    }, select: { id: true, recipientEmail: true, updatedAt: true } })
    if (!delivery || delivery.recipientEmail.toLowerCase() !== to.toLowerCase()) throw new Error("Commande d’envoi incohérente ou inaccessible")
    // Share a write conflict with cancellation/closure, not just the quota row.
    const claimed = await tx.emailDelivery.updateMany({ where: { id: delivery.id, companyId: input.companyId, status: "SENDING", closedAt: null, updatedAt: delivery.updatedAt }, data: { updatedAt: now } })
    if (claimed.count !== 1) throw new QuotaStateConflict()
    const windows = await Promise.all(periods.map(period => quotaState(tx, identity, period, now)))
    const reservations = []
    let retryAt: Date | null = null
    for (const window of windows) {
      const existing = await tx.emailSendQuotaCharge.findUnique({ where: { deliveryId_period_windowStart: { deliveryId: input.deliveryId, period: window.period, windowStart: window.windowStart } } })
      const limit = window.period === "DAY" ? policy.dailyRecipientLimit : policy.minuteRecipientLimit
      if (!existing && window.used + recipientUnits > limit) {
        const reset = new Date(window.windowStart.getTime() + window.duration)
        if (!retryAt || reset > retryAt) retryAt = reset
      }
      reservations.push({ ...window, existing })
    }
    if (retryAt) throw new EmailSendQuotaError("Plafond interne atteint ; l’envoi attend la prochaine période disponible", retryAt)
    for (const window of reservations) {
      if (window.existing) continue
      const data = { windowStart: window.windowStart, used: window.used + recipientUnits }
      if (window.state) {
        const saved = await tx.emailSendQuotaState.updateMany({ where: { id: window.state.id, companyId: input.companyId, version: window.state.version }, data: { ...data, version: { increment: 1 } } })
        if (saved.count !== 1) throw new QuotaStateConflict()
      } else await tx.emailSendQuotaState.create({ data: { ...identity, channelId: channelId(input.channelKey), period: window.period, ...data } })
      await tx.emailSendQuotaCharge.create({ data: { ...identity, channelId: channelId(input.channelKey), deliveryId: input.deliveryId, period: window.period, windowStart: window.windowStart, recipientUnits, bindingHash, policyVersion: policy.version } })
    }
    return { recipientUnits }
  })
}

/** Read-only projection: no command, recipient address, body or fingerprint. */
export async function readEmailSendQuota(identity: Identity, now = new Date()) {
  return prisma.$transaction(async tx => {
    const policy = await readPolicy(tx, identity)
    const windows = await Promise.all(periods.map(period => quotaState(tx, identity, period, now)))
    return {
      channelKey: identity.channelKey, version: policy?.version || 0, enabled: policy?.enabled || false,
      dailyRecipientLimit: policy?.dailyRecipientLimit ?? null, minuteRecipientLimit: policy?.minuteRecipientLimit ?? null,
      windows: windows.map(window => ({ period: window.period, used: window.used, resetAt: new Date(window.windowStart.getTime() + window.duration).toISOString() })),
    }
  })
}

export async function saveEmailSendQuota(companyId: string, input: unknown) {
  assertDemoMutationAllowed()
  const context = getContext()
  if (!context || context.companyId !== companyId) throw new Error("Accès administrateur requis")
  const data = policyInput.parse(input)
  const identity = { companyId, channelKey: data.channelKey }
  await serializable(async tx => {
    const member = await tx.membership.findFirst({ where: { companyId, userId: context.userId, status: "ACTIVE" }, select: { role: true } })
    if (!member || !hasPermission(normalizeCompanyRole(member.role), "company.manage")) throw new Error("Accès administrateur requis")
    const current = await readPolicy(tx, identity)
    if ((current?.version || 0) !== data.version) throw new EmailSendQuotaConflict("Les plafonds ont changé ; actualisez avant de les enregistrer")
    const limits = { enabled: data.enabled, dailyRecipientLimit: data.dailyRecipientLimit, minuteRecipientLimit: data.minuteRecipientLimit }
    if (!current) await tx.emailSendQuotaPolicy.create({ data: { ...identity, channelId: channelId(data.channelKey), ...limits } })
    else {
      const saved = await tx.emailSendQuotaPolicy.updateMany({ where: { id: current.id, companyId, version: data.version }, data: { ...limits, version: { increment: 1 } } })
      if (saved.count !== 1) throw new EmailSendQuotaConflict("Les plafonds ont changé ; actualisez avant de les enregistrer")
    }
  })
  return readEmailSendQuota(identity)
}
