"use client"

import { useEffect, useState, useTransition } from "react"
import { getAutomationJournalSequences } from "@/actions/automations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { controlClass } from "./automation-model"

export function JournalSequencePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getAutomationJournalSequences>> | null>(null)
  const [search, setSearch] = useState(""), [page, setPage] = useState(1), [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => startTransition(async () => {
      try {
        const next = await getAutomationJournalSequences({ search, page, selectedId: value === "ALL" ? undefined : value })
        if (active) { setData(next); setError(!next); if (next && value !== "ALL" && !next.selected) onChange("ALL") }
      } catch { if (active) setError(true) }
    }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [search, page, value, onChange])
  const rows = data?.selected && !data.rows.some(row => row.id === data.selected!.id) ? [data.selected, ...data.rows] : data?.rows || []
  return <div className="min-w-0 space-y-1.5 lg:w-64" aria-busy={pending}>
    <Input aria-label="Rechercher une séquence du journal" maxLength={200} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} placeholder="Rechercher une séquence…" />
    <select value={value} onChange={event => onChange(event.target.value)} className={controlClass} disabled={pending} aria-label="Filtrer par séquence"><option value="ALL">Toutes les séquences</option>{rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
    {error ? <p role="alert" className="text-xs">Impossible de charger les séquences</p> : null}
    {data ? <div className="flex flex-wrap items-center gap-1 text-xs"><Button size="sm" variant="outline" aria-label="Page précédente : séquences du journal" disabled={pending || data.page <= 1} onClick={() => setPage(data.page - 1)}>Page précédente</Button><span>{data.total} · {data.page}/{data.pageCount}</span><Button size="sm" variant="outline" aria-label="Page suivante : séquences du journal" disabled={pending || data.page >= data.pageCount} onClick={() => setPage(data.page + 1)}>Page suivante</Button></div> : null}
  </div>
}
