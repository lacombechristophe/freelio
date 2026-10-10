"use client"

import { useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"

type Page<T> = { rows: T[]; selected?: T | null; total: number; page: number; pageCount: number }
type Query = { page: number; selectedId?: string; search: string; status?: string; category?: string }

export function useStudioPage<T extends { id: string }>(rows: T[], total: number, selectedId: string, filters: { search: string; status?: string; category?: string }, revision: unknown, load: (query: Query) => Promise<Page<T> | null>, onSelect?: (id: string) => void) {
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<Page<T>>({ rows: rows.slice(0, 25), selected: rows.find(row => row.id === selectedId) || null, total, page: 1, pageCount: Math.max(1, Math.ceil(total / 25)) })
  const [error, setError] = useState("")
  const [loading, startTransition] = useTransition()
  const { search, status, category } = filters
  useEffect(() => {
    let active = true
    const timer = window.setTimeout(() => startTransition(async () => {
      try {
        const response = await load({ page, selectedId: selectedId || undefined, search, status, category })
        if (active) { if (!response) throw new Error(); setResult(response); setError(""); if (!response.selected && response.rows[0]) onSelect?.(response.rows[0].id) }
      } catch { if (active) { setError("Impossible de charger la liste"); setResult(previous => ({ ...previous, rows: [], selected: null })) } }
    }), 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [page, selectedId, search, status, category, revision, load, onSelect])
  return { result, error, loading, setPage }
}

export function StudioPagination({ page, pageCount, total, label, loading, onPage }: { page: number; pageCount: number; total: number; label: string; loading: boolean; onPage: (page: number) => void }) {
  return <div className="flex flex-wrap items-center gap-2 p-3 text-xs" aria-label={`Pagination : ${label}`}>
    <Button size="sm" variant="outline" aria-label={`Page précédente : ${label}`} disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>Page précédente</Button>
    <span>{total} résultat(s) · Page {page} sur {pageCount}</span>
    <Button size="sm" variant="outline" aria-label={`Page suivante : ${label}`} disabled={loading || page >= pageCount} onClick={() => onPage(page + 1)}>Page suivante</Button>
  </div>
}
