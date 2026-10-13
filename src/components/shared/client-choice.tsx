"use client"

import * as React from "react"
import { getClientChoices } from "@/actions/clients/choices"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

export type ClientOption = { id: string; name: string }
type Choices = Awaited<ReturnType<typeof getClientChoices>>

export function useClientChoices(value: string, initialSelected?: ClientOption, enabled = true) {
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [revision, setRevision] = React.useState(0)
  const [loading, startTransition] = React.useTransition()
  const [lookup, setLookup] = React.useState<{ key: string; data: Choices | null; error: boolean } | null>(null)
  const [selected, setSelected] = React.useState(initialSelected)
  const initialId = initialSelected?.id, initialName = initialSelected?.name
  React.useEffect(() => {
    if (!enabled) return
    setSearch(""); setPage(1); setRevision(current => current + 1)
    setSelected(initialId && initialName ? { id: initialId, name: initialName } : undefined)
  }, [enabled, initialId, initialName])

  const key = JSON.stringify([value, search, page, revision])
  const fresh = lookup?.key === key
  React.useEffect(() => {
    if (!enabled || fresh) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getClientChoices({ selectedId: value || undefined, search, page })
        if (!data) throw new Error("Liste indisponible")
        if (current) {
          setPage(data.page)
          setLookup({ key: JSON.stringify([value, search, data.page, revision]), data, error: false })
          if (data.selected) setSelected(data.selected)
        }
      } catch {
        if (current) setLookup(previous => ({ key, data: previous?.data ?? null, error: true }))
      }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [enabled, fresh, key, value, search, page, revision])

  const busy = enabled && (loading || !fresh)
  const ready = enabled && fresh && !lookup?.error && Boolean(value && lookup?.data?.selected?.id === value)
  const error = fresh && (Boolean(lookup?.error) || Boolean(value && !ready))
  const currentSelection = selected?.id === value ? selected : undefined
  const items = fresh && !lookup?.error ? lookup?.data?.items ?? [] : []
  const options = currentSelection && !items.some(item => item.id === currentSelection.id) ? [currentSelection, ...items] : items
  return {
    value, selected: currentSelection, search, page, ready, busy, error, options,
    total: lookup?.data?.total ?? 0,
    searchFor: (query: string) => { setSearch(query); setPage(1) },
    goToPage: setPage,
    retry: () => setRevision(current => current + 1),
    remember: (id: string) => setSelected(options.find(item => item.id === id)),
  }
}

export function ClientChoice({ choices, onChange, label, disabled = false, placeholder = "Sélectionner…", triggerClassName }: {
  choices: ReturnType<typeof useClientChoices>
  onChange: (id: string) => void
  label: string
  disabled?: boolean
  placeholder?: string
  triggerClassName?: string
}) {
  return <>
    <Input aria-label="Rechercher un client" placeholder="Rechercher un client…" maxLength={200} value={choices.search} disabled={disabled} onChange={event => choices.searchFor(event.target.value)} />
    <Select value={choices.value} disabled={disabled} onValueChange={value => {
      const id = value ?? ""
      choices.remember(id); onChange(id)
    }}>
      <SelectTrigger aria-label={label} className={triggerClassName}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{choices.options.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
    </Select>
    <DirectoryPagination total={choices.total} page={choices.page} pending={choices.busy} error={choices.error} onPage={choices.goToPage} onRetry={choices.retry} />
  </>
}
