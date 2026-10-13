"use client"

import { useCallback, useEffect, useState, useTransition } from "react"

type ChoicePage<T> = { items: T[]; total: number; page: number; selected: T | null }

export function usePurchaseChoices<T extends { id: string }>(value: string, enabled: boolean, revision: unknown, load: (input: { search: string; page: number; selectedId?: string }) => Promise<ChoicePage<T>>) {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [retryCount, setRetryCount] = useState(0)
  const retry = useCallback(() => setRetryCount(current => current + 1), [])
  const [loading, startTransition] = useTransition()
  const [lookup, setLookup] = useState<{ key: string; data: ChoicePage<T> | null; error: boolean } | null>(null)
  const [selected, setSelected] = useState<T>()
  const key = JSON.stringify([value, search, page, revision, retryCount])
  const fresh = lookup?.key === key
  useEffect(() => {
    if (!enabled || fresh) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await load({ search, page, selectedId: value || undefined })
        if (!data) throw new Error("Liste indisponible")
        if (current) {
          setPage(data.page)
          setLookup({ key: JSON.stringify([value, search, data.page, revision, retryCount]), data, error: false })
          if (data.selected) setSelected(data.selected)
        }
      } catch {
        if (current) setLookup(previous => ({ key, data: previous?.data ?? null, error: true }))
      }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [enabled, fresh, key, value, search, page, revision, retryCount, load])
  const busy = enabled && (loading || !fresh)
  const ready = enabled && fresh && !lookup?.error && (!value || lookup?.data?.selected?.id === value)
  const error = fresh && (Boolean(lookup?.error) || Boolean(value && !ready))
  const currentSelection = selected?.id === value ? selected : undefined
  const items = fresh && !lookup?.error ? lookup?.data?.items ?? [] : []
  const options = currentSelection && !items.some(item => item.id === currentSelection.id) ? [currentSelection, ...items] : items
  return { search, page, busy, ready, error, options, total: lookup?.data?.total ?? 0,
    searchFor: (query: string) => { setSearch(query); setPage(1) }, goToPage: setPage, retry,
    remember: (id: string) => { const option = options.find(item => item.id === id); setSelected(option); return option } }
}
