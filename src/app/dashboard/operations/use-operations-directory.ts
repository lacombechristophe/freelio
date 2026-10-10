"use client"

import { useEffect, useState, useTransition } from "react"

export function useOperationsDirectory<T extends { total: number; page: number }>(agencyId: string, revision: unknown, load: (input: { search: string; page: number; agencyId?: string }) => Promise<T>) {
  const [query, setQuery] = useState({ search: "", page: 1, agencyId })
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ key: string; data: T } | null>(null)
  const [error, setError] = useState(false)
  const page = query.agencyId === agencyId ? query.page : 1
  const key = JSON.stringify([query.search, page, agencyId, retry, revision])
  useEffect(() => { setQuery(current => ({ ...current, page: 1, agencyId })); setError(false) }, [agencyId])
  useEffect(() => {
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await load({ search: query.search, page, agencyId: agencyId === "ALL" ? undefined : agencyId })
        if (!data) throw new Error("Liste indisponible")
        if (current) { setResult({ key, data }); setError(false) }
      } catch { if (current) setError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [query.search, page, agencyId, key, load])
  const fresh = result?.key === key
  return { search: query.search, setSearch: (search: string) => { setQuery({ search, page: 1, agencyId }); setError(false) },
    data: result?.data, visible: fresh && result && !error ? result.data : null, pending: pending || (!fresh && !error), error,
    page: fresh && result ? result.data.page : page, setPage: (next: number) => { setQuery(current => ({ ...current, page: next, agencyId })); setError(false) }, retry: () => { setError(false); setRetry(current => current + 1) } }
}
