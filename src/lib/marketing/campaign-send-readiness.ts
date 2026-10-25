import "server-only"
import type { TransactionClient } from "@/lib/prisma"
import { emailAddressSchema } from "@/lib/communications/recipients"
import { mailDraftScopeGranted, mailScopeGranted } from "@/lib/communications/capabilities"
import { readOAuthCredentials } from "@/lib/communications/email-provider"
import { readResendCredentials } from "@/lib/communications/provider-credentials"
import { EmailSendQuotaConfigurationError, readEmailSendQuota } from "@/lib/communications/send-quotas"
import { CampaignManagementError } from "./campaign-management"

type State = "NOT_REQUIRED" | "SENDER_REQUIRED" | "SENDER_UNAVAILABLE" | "LOCAL_CREDENTIALS_INVALID" | "MAIL_CAPABILITY_MISSING" | "QUOTA_NOT_CONFIGURED" | "QUOTA_DISABLED" | "QUOTA_INVALID" | "QUOTA_WAIT" | "READY"
type Quota = Omit<Awaited<ReturnType<typeof readEmailSendQuota>>, "channelKey">
export type CampaignSendReadiness = { required: boolean; ready: boolean; availableNow: boolean; state: State; message: string; quota: Quota | null }

export class CampaignSendPreflightError extends CampaignManagementError {
  constructor(message: string, readonly kind: "QUOTA" | "SENDER") { super(message) }
}

export async function campaignSendReadiness(tx: TransactionClient, actor: { companyId: string; userId: string; role: string },
  sequence: { senderChannelId: string | null; steps: Array<{ type: string }> }, now = new Date()): Promise<CampaignSendReadiness> {
  const blocked = (state: State, message: string, quota: Quota | null = null): CampaignSendReadiness => ({ required: true, ready: false, availableNow: false, state, message, quota })
  if (!sequence.steps.some(step => step.type === "EMAIL")) return { required: false, ready: true, availableNow: false, state: "NOT_REQUIRED", message: "Cette séquence ne prévoit pas d’envoi d’e-mail", quota: null }
  // Campaign activation has always required a connected mailbox, not fallback.
  if (!sequence.senderChannelId || sequence.senderChannelId === "platform") return blocked("SENDER_REQUIRED", "Choisissez une boîte expéditrice connectée dans les réglages de la séquence")
  const channel = await tx.communicationChannel.findFirst({ where: { id: sequence.senderChannelId, companyId: actor.companyId,
    ...(["OWNER", "ADMIN"].includes(actor.role) ? {} : { OR: [{ visibility: "SHARED" }, { visibility: "PRIVATE", ownerUserId: actor.userId }] }) },
    select: { id: true, companyId: true, status: true, provider: true, emailAddress: true, displayName: true, credentialsEncrypted: true, lastSyncAt: true, mailEnabled: true } })
  if (!channel || channel.status !== "ACTIVE") return blocked("SENDER_UNAVAILABLE", "Boîte expéditrice déconnectée ou inaccessible")
  if (!channel.mailEnabled) return blocked("MAIL_CAPABILITY_MISSING", "Les e-mails sont désactivés pour cette connexion")
  if (!emailAddressSchema.safeParse(channel.emailAddress).success) return blocked("LOCAL_CREDENTIALS_INVALID", "Adresse expéditrice invalide ; vérifiez la connexion")
  if (channel.provider === "RESEND") {
    const stored = readResendCredentials(channel.credentialsEncrypted)
    if (channel.credentialsEncrypted ? !stored : !process.env.RESEND_API_KEY?.trim()) return blocked("LOCAL_CREDENTIALS_INVALID", "Identifiants Resend absents ou invalides ; reconnectez cette boîte")
  } else if (["GOOGLE", "MICROSOFT"].includes(channel.provider)) {
    let scopes: string
    try { scopes = readOAuthCredentials(channel).scope }
    catch { return blocked("LOCAL_CREDENTIALS_INVALID", "Autorisation OAuth locale absente ou illisible ; reconnectez cette boîte") }
    if (!mailScopeGranted(channel.provider, scopes, "SEND") || !mailDraftScopeGranted(channel.provider, scopes)) return blocked("MAIL_CAPABILITY_MISSING", "Reconnectez cette boîte pour autoriser l’envoi et la reprise des brouillons")
  } else return blocked("LOCAL_CREDENTIALS_INVALID", "Fournisseur d’e-mail non pris en charge")

  let usage: Awaited<ReturnType<typeof readEmailSendQuota>>
  try { usage = await readEmailSendQuota({ companyId: actor.companyId, channelKey: channel.id }, now, tx) }
  catch (error) {
    if (error instanceof EmailSendQuotaConfigurationError) return blocked("QUOTA_INVALID", "Configuration des plafonds incohérente ; vérifiez les réglages de la boîte")
    throw error
  }
  const { channelKey: _channelKey, ...quota } = usage; void _channelKey
  if (quota.version === 0) return blocked("QUOTA_NOT_CONFIGURED", "Configurez les plafonds internes de cette boîte dans Communications avant de vérifier l’audience", quota)
  if (!quota.enabled) return blocked("QUOTA_DISABLED", "Les plafonds internes de cette boîte sont désactivés ; activez-les avant de vérifier l’audience", quota)
  const { dailyRecipientLimit, minuteRecipientLimit } = quota
  if (dailyRecipientLimit === null || minuteRecipientLimit === null || dailyRecipientLimit < 1 || minuteRecipientLimit < 1 || minuteRecipientLimit > dailyRecipientLimit) return blocked("QUOTA_INVALID", "Les plafonds internes sont invalides ; corrigez les réglages de la boîte", quota)
  const full = quota.windows.some(window => window.used >= (window.period === "DAY" ? dailyRecipientLimit : minuteRecipientLimit))
  return { required: true, ready: true, availableNow: !full, state: full ? "QUOTA_WAIT" : "READY", quota,
    message: full ? "Plafond interne atteint : l’activation reste possible, les messages attendront une période disponible" : "Configuration locale et plafonds internes présents" }
}

export async function assertCampaignSendReady(tx: TransactionClient, actor: { companyId: string; userId: string; role: string },
  sequence: { senderChannelId: string | null; steps: Array<{ type: string }> }) {
  const report = await campaignSendReadiness(tx, actor, sequence)
  if (!report.ready) throw new CampaignSendPreflightError(report.message, report.state.startsWith("QUOTA_") ? "QUOTA" : "SENDER")
}
