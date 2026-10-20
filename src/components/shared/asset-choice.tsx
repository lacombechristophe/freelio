"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { getAssetEquipmentChoices, getAssetSiteChoices } from "@/actions/asset-choices"
import { DirectoryPagination } from "./directory-pagination"
import { Input } from "@/components/ui/input"

type Result = Awaited<ReturnType<typeof getAssetSiteChoices>>
type Context = { clientId?: string; siteId?: string; enabled?: boolean }

export function useAssetChoices(kind: "site" | "equipment", value: string, { clientId, siteId, enabled = true }: Context = {}) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const retry = useCallback(() => setRevision(current => current + 1), [])
  const [loading, startTransition] = useTransition()
  const [lookup, setLookup] = useState<{ key: string; data: Result | null; error: boolean } | null>(null)
  const [selected, setSelected] = useState<Result["selected"]>(null)
  const key = JSON.stringify([kind, value, search, page, clientId, siteId, revision])
  const fresh = lookup?.key === key
  useEffect(() => {
    if (!enabled || fresh) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const query = { search, page, selectedId: value || undefined, clientId: clientId || undefined }
        const data = kind === "site" ? await getAssetSiteChoices(query) : await getAssetEquipmentChoices({ ...query, siteId: siteId || undefined })
        if (current) {
          setPage(data.page)
          setLookup({ key: JSON.stringify([kind, value, search, data.page, clientId, siteId, revision]), data, error: false })
          if (data.selected) setSelected(data.selected)
        }
      } catch { if (current) setLookup(previous => ({ key, data: previous?.data ?? null, error: true })) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [kind, value, search, page, clientId, siteId, revision, enabled, fresh, key])
  const ready = enabled && fresh && !lookup.error && Boolean(value && lookup.data?.selected?.id === value)
  const currentSelection = selected?.id === value ? selected : null
  const items = fresh && !lookup.error ? lookup.data?.items ?? [] : []
  const options = currentSelection && !items.some(item => item.id === currentSelection.id) ? [currentSelection, ...items] : items
  return { kind, value, search, page, ready, enabled, options, total: lookup?.data?.total ?? 0, busy: enabled && (loading || !fresh),
    error: enabled && fresh && lookup.error, unavailable: enabled && fresh && !lookup.error && Boolean(value && !ready),
    searchFor: (next: string) => { setSearch(next); setPage(1) }, goToPage: setPage, retry,
    remember: (id: string) => setSelected(options.find(item => item.id === id) ?? null) }
}

export function AssetChoice({ choices, name, required = false, disabled = false, onChange }: {
  choices: ReturnType<typeof useAssetChoices>; name: string; required?: boolean; disabled?: boolean; onChange: (value: string) => void
}) {
  const noun = choices.kind === "site" ? "site" : "équipement"
  return <>
    <Input aria-label={`Rechercher un ${noun} à rattacher`} placeholder={`Rechercher un ${noun}…`} maxLength={200} value={choices.search} disabled={disabled || !choices.enabled} onChange={event => choices.searchFor(event.target.value)} />
    <select id={name} name={name} value={choices.value} required={required} disabled={disabled || !choices.enabled} onChange={event => { choices.remember(event.target.value); onChange(event.target.value) }} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20">
      <option value="">Sélectionner…</option>{choices.options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
    {choices.enabled ? <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy || disabled} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} /> : <p className="text-xs text-muted-foreground">Choisissez d’abord le client ou le site de rattachement.</p>}
    {choices.unavailable ? <p role="alert" className="text-sm text-danger">La référence choisie n’est plus disponible dans ce périmètre. Remplacez-la ou retirez-la si elle est facultative.</p> : null}
  </>
}
