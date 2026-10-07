"use client"

import { useState } from "react"
import { checkSequenceEmailResult, repairSequenceEmailHistory, closeSequenceEmailWithoutRetry } from "@/actions/automations"
import type { AutomationRunner } from "./automation-model"
import type { sequenceRecoveryState } from "@/lib/automations/sequence-recovery"
import { STATUS_LABELS, formatAutomationDate } from "./automation-model"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type State = NonNullable<Awaited<ReturnType<typeof sequenceRecoveryState>>>
const outcomes: Record<string, string> = { ACCEPTED: "Acceptation confirmée", UNKNOWN: "Résultat inconnu", DRAFT: "Brouillon fournisseur : résultat d’envoi inconnu", UNAVAILABLE: "Vérification indisponible : résultat inconnu" }
export function SequenceRecoveryPanel({ id, state, pending, run }: { id: string; state: State; pending: boolean; run: AutomationRunner }) {
  const [reason, setReason] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const identity = { id, version: state.version }
  return <div className="space-y-3 rounded-lg border bg-muted/25 p-3" aria-label="Reprise de séquence">
    <p className="text-sm font-medium" role="status">{outcomes[state.outcome] || "Résultat inconnu"}</p>
    <p className="text-xs text-muted-foreground">Inscription : {STATUS_LABELS[state.enrollmentStatus] || state.enrollmentStatus}{state.checkedAt ? ` · Vérifiée le ${formatAutomationDate(state.checkedAt)}` : ""}</p>
    {state.closedAt ? <p className="text-xs">Classée sans relance le {formatAutomationDate(state.closedAt)}. La commande et son résultat sont conservés.</p> : null}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending || !state.canCheck} onClick={() => run(() => checkSequenceEmailResult(identity), "Vérification conservée.")}>Vérifier le résultat</Button>
      {state.canRepair ? <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => repairSequenceEmailHistory(identity), "Historique réparé ; inscription conservée en pause.")}>Réparer l’historique</Button> : null}
    </div>
    {state.canClose ? <div className="space-y-2">
      <label className="block text-xs">Motif du classement<Input value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
      <label className="flex items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Je confirme l’arrêt de cette inscription, sans relance et sans effacement de la commande.</label>
      <Button variant="outline" size="sm" disabled={pending || !confirmed || reason.trim().length < 3} onClick={() => run(() => closeSequenceEmailWithoutRetry({ ...identity, reason, confirmed }), "Commande classée sans relance ; inscription arrêtée.")}>Classer sans relance</Button>
    </div> : null}
  </div>
}
