"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { getDeliveryLineChoices, getDeliveryOrderChoices } from "@/actions/delivery-choices"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "./directory-pagination"

type Result = Awaited<ReturnType<typeof getDeliveryLineChoices>> | Awaited<ReturnType<typeof getDeliveryOrderChoices>>

export function useDeliveryChoices(kind: "order" | "line", value: string, customerOrderId: string, enabled: boolean) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(current => current + 1), [])
  const [loading, startTransition] = useTransition()
  const [lookup, setLookup] = useState<{ key: string; data: Result | null; error: boolean } | null>(null)
  const [selected, setSelected] = useState<Result["selected"]>(null)
  const key = JSON.stringify([kind, value, customerOrderId, search, page, revision])
  const fresh = lookup?.key === key
  useEffect(() => {
    if (!enabled || fresh) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const query = { search, page, selectedId: value || undefined }
        const data = kind === "order" ? await getDeliveryOrderChoices(query) : await getDeliveryLineChoices({ ...query, customerOrderId })
        if (current) {
          setPage(data.page)
          setLookup({ key: JSON.stringify([kind, value, customerOrderId, search, data.page, revision]), data, error: false })
          if (data.selected) setSelected(data.selected)
        }
      } catch { if (current) setLookup(previous => ({ key, data: previous?.data ?? null, error: true })) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [kind, value, customerOrderId, search, page, revision, enabled, fresh, key])
  const ready = enabled && fresh && !lookup.error && Boolean(value && lookup.data?.selected?.id === value)
  const currentSelection = selected?.id === value ? selected : null
  const items = enabled && fresh && !lookup.error ? lookup.data?.items ?? [] : []
  const options = currentSelection && !items.some(item => item.id === currentSelection.id) ? [currentSelection, ...items] : items
  return { kind, value, search, page, ready, enabled, options, selected: ready ? lookup.data?.selected : null,
    total: lookup?.data?.total ?? 0, busy: enabled && (loading || !fresh), error: enabled && fresh && lookup.error,
    unavailable: enabled && fresh && !lookup.error && Boolean(value && !ready), retry,
    searchFor: (next: string) => { setSearch(next); setPage(1) }, goToPage: setPage,
    remember: (id: string) => setSelected(options.find(item => item.id === id) ?? null) }
}

export function DeliveryChoice({ choices, name, disabled, onChange }: { choices: ReturnType<typeof useDeliveryChoices>; name: string; disabled: boolean; onChange: (value: string) => void }) {
  const noun = choices.kind === "order" ? "une commande à livrer" : "une ligne à livrer"
  return <>
    <Input aria-label={`Rechercher ${noun}`} placeholder={`Rechercher ${noun}…`} maxLength={200} value={choices.search} disabled={disabled || !choices.enabled} onChange={event => choices.searchFor(event.target.value)} />
    <select id={name} name={name} required value={choices.value} disabled={disabled || !choices.enabled} onChange={event => { choices.remember(event.target.value); onChange(event.target.value) }} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{choices.options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {choices.enabled ? <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy || disabled} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} /> : <p className="text-xs text-muted-foreground">Choisissez d’abord la commande à livrer.</p>}
    {choices.unavailable ? <p role="alert" className="text-sm text-danger">La sélection n’est plus disponible. Remplacez-la pour enregistrer ; votre saisie est conservée.</p> : null}
  </>
}
