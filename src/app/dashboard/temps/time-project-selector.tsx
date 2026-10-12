"use client"

import * as React from "react"
import { getTimeProjectChoices } from "@/actions/temps/directory"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Choices = Awaited<ReturnType<typeof getTimeProjectChoices>>

export function TimeProjectSelector({ value, onChange, nativeId }: { value: string; onChange: (value: string) => void; nativeId?: string }) {
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [retry, setRetry] = React.useState(0)
  const [pending, startTransition] = React.useTransition()
  const initialized = React.useRef(false)
  const key = JSON.stringify([search, page, value, retry])
  const [result, setResult] = React.useState<{ key: string; data: Choices | null; error: boolean }>({ key: "", data: null, error: false })
  const fresh = result.key === key, busy = pending || !fresh
  React.useEffect(() => {
    if (fresh) return
    let ignore = false
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getTimeProjectChoices({ search, page, selectedId: value || undefined })
        if (!data) throw new Error("Liste indisponible")
        if (!ignore) {
          setPage(data.page)
          setResult({ data, key: JSON.stringify([search, data.page, value, retry]), error: false })
          if (!initialized.current) {
            initialized.current = true
            if (nativeId && !value && data.items[0]) onChange(data.items[0].id)
          }
        }
      } catch { if (!ignore) setResult(previous => ({ ...previous, key, error: true })) }
    }), 200)
    return () => { ignore = true; clearTimeout(timer) }
  }, [fresh, key, search, page, value, retry, nativeId, onChange])
  const items = result.data?.items ?? []
  const selected = result.data?.selected?.id === value ? result.data.selected : items.find(item => item.id === value)
  const options = selected && !items.some(item => item.id === selected.id) ? [selected, ...items] : items
  return <div className="flex-1 space-y-3">
    <Input aria-label="Rechercher un chantier" placeholder="Rechercher un chantier…" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
    {nativeId ? <select id={nativeId} value={value} onChange={event => onChange(event.target.value)} disabled={busy || result.error} required className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none">
      <option value="">Sélectionner un projet…</option>
      {value && !options.some(item => item.id === value) ? <option value={value}>Sélection actuelle</option> : null}
      {options.map(item => <option key={item.id} value={item.id}>{item.name} ({item.client.name})</option>)}
    </select> : <Select value={value} onValueChange={id => onChange(id ?? "")} disabled={busy || result.error}>
      <SelectTrigger aria-label="Projet du chronomètre" className="w-full bg-background border-border"><SelectValue placeholder="Affecter à un projet…" /></SelectTrigger>
      <SelectContent>{options.map(item => <SelectItem key={item.id} value={item.id}>{item.name} — <span className="text-xs text-muted-foreground">{item.client.name}</span></SelectItem>)}</SelectContent>
    </Select>}
    <DirectoryPagination total={result.data?.total ?? 0} page={page} pending={busy} error={fresh && result.error} onPage={setPage} onRetry={() => setRetry(value => value + 1)} />
  </div>
}
