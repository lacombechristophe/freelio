"use client"

import { useCallback } from "react"
import { getReservationOrderChoices, getReservationProjectChoices } from "@/actions/reservation-choices"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { usePurchaseChoices } from "./use-purchase-choices"

export function useReservationChoices(kind: "order" | "project", value: string, enabled: boolean, revision: string) {
  const load = useCallback((input: { search: string; page: number; selectedId?: string }) => kind === "order" ? getReservationOrderChoices(input) : getReservationProjectChoices(input), [kind])
  return { ...usePurchaseChoices(value, enabled, revision, load), kind, value }
}

export function ReservationReferenceChoice({ choices, name, disabled, onChange }: {
  choices: ReturnType<typeof useReservationChoices>; name: string; disabled: boolean; onChange: (id: string) => void
}) {
  const noun = choices.kind === "order" ? "une commande client" : "un chantier"
  return <>
    <Input aria-label={`Rechercher ${noun}`} placeholder={`Rechercher ${noun}…`} maxLength={200} value={choices.search} disabled={disabled} onChange={event => choices.searchFor(event.target.value)} />
    <select id={name} name={name} value={choices.value} disabled={disabled} onChange={event => { choices.remember(event.target.value); onChange(event.target.value) }} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{choices.options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy || disabled} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} />
    {choices.value && !choices.busy && !choices.ready ? <p role="alert" className="text-sm text-danger">Le choix n’a pas pu être vérifié. Réessayez ou remplacez-le ; votre saisie est conservée.</p> : null}
  </>
}
