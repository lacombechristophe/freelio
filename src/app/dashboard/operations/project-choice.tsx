"use client"

import { useCallback } from "react"
import { getOperationsProjectChoices } from "@/actions/operations"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { usePurchaseChoices } from "./use-purchase-choices"

export function useOperationsProjectChoices(value: string, enabled: boolean, revision: string, clientId?: string, siteId?: string) {
  const load = useCallback((input: { search: string; page: number; selectedId?: string }) => getOperationsProjectChoices({ ...input, clientId, siteId }), [clientId, siteId])
  return { ...usePurchaseChoices(value, enabled, JSON.stringify([revision, clientId, siteId]), load), enabled, value }
}

export function OperationsProjectChoice({ choices, disabled, onChange }: {
  choices: ReturnType<typeof useOperationsProjectChoices>; disabled: boolean; onChange: (id: string) => void
}) {
  return <>
    <Input aria-label="Rechercher un chantier" placeholder="Rechercher un chantier…" maxLength={200} value={choices.search} disabled={disabled || !choices.enabled} onChange={event => choices.searchFor(event.target.value)} />
    <select id="projectId" name="projectId" value={choices.value} disabled={disabled || !choices.enabled} onChange={event => { choices.remember(event.target.value); onChange(event.target.value) }} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{choices.options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {choices.enabled ? <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy || disabled} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} /> : <p className="text-xs text-muted-foreground">Choisissez d’abord le client ou le site de rattachement.</p>}
    {choices.value && !choices.busy && !choices.ready ? <p role="alert" className="text-sm text-danger">Le choix n’a pas pu être vérifié. Réessayez ou remplacez-le ; votre saisie est conservée.</p> : null}
  </>
}
