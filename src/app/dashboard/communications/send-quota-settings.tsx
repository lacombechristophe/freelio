"use client"

import { useId, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { configureCommunicationSendQuota } from "@/actions/communications"
import type { readEmailSendQuota } from "@/lib/communications/send-quotas"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export type MailboxSendQuota = Awaited<ReturnType<typeof readEmailSendQuota>> & { label: string }

export function SendQuotaSettings({ quota, canManage }: { quota: MailboxSendQuota; canManage: boolean }) {
  const id = useId(), router = useRouter()
  const [pending, startTransition] = useTransition()
  return <Card>
    <CardHeader>
      <CardTitle className="text-base">Plafonds d’envoi · {quota.label}</CardTitle>
      <CardDescription>Destinataires admis, CC et CCI compris. Périodes fixes en UTC. Les plafonds du fournisseur et la délivrabilité restent à vérifier séparément.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm">{quota.version === 0 ? "Configuration requise avant tout nouvel envoi" : quota.enabled ? "Plafonds internes actifs" : "Nouveaux envois suspendus"}</p>
      <div className="space-y-1 text-xs text-muted-foreground">
        {quota.windows.map(window => <p key={window.period}>{window.period === "DAY" ? "Jour UTC" : "Minute UTC"} : {window.used} / {(window.period === "DAY" ? quota.dailyRecipientLimit : quota.minuteRecipientLimit) ?? "non défini"} · prochaine période {new Date(window.resetAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC</p>)}
        <p>Une admission reste consommée après un résultat incertain. Modifier les plafonds ne remet pas les compteurs à zéro. Ces limites internes ne garantissent pas la gratuité du compte fournisseur.</p>
      </div>
      {canManage ? <form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        startTransition(async () => {
          try {
            const result = await configureCommunicationSendQuota({ channelKey: quota.channelKey, version: quota.version,
              enabled: form.get("enabled") === "on", dailyRecipientLimit: Number(form.get("daily")), minuteRecipientLimit: Number(form.get("minute")) })
            if (!result.success) { toast.error(result.error); return }
            toast.success("Plafonds enregistrés")
            router.refresh()
          } catch { toast.error("Impossible d’enregistrer les plafonds ; votre saisie est conservée") }
        })
      }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor={`${id}-day`}>Destinataires par jour UTC</Label><Input id={`${id}-day`} name="daily" type="number" min={1} max={1_000_000} step={1} required defaultValue={quota.dailyRecipientLimit ?? ""} disabled={pending} /></div>
          <div className="space-y-1"><Label htmlFor={`${id}-minute`}>Destinataires par minute UTC</Label><Input id={`${id}-minute`} name="minute" type="number" min={1} max={1_000_000} step={1} required defaultValue={quota.minuteRecipientLimit ?? ""} disabled={pending} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input name="enabled" type="checkbox" defaultChecked={quota.enabled} disabled={pending} />Autoriser les nouveaux envois avec ces plafonds</label>
        <Button demoMutation type="submit" size="sm" disabled={pending}>Enregistrer les plafonds</Button>
      </form> : null}
    </CardContent>
  </Card>
}
