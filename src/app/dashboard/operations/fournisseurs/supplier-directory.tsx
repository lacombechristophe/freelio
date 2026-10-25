"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { getSupplierDirectory } from "@/actions/suppliers"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

type Directory = Awaited<ReturnType<typeof getSupplierDirectory>>
export function SupplierDirectory({ initialData }: { initialData: Directory }) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("ALL")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState(false)
  const key = JSON.stringify([search, status, page, retry])
  const [result, setResult] = useState({ key: JSON.stringify(["", "ALL", 1, 0]), data: initialData })
  useEffect(() => {
    if (key === result.key) return
    let current = true
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await getSupplierDirectory({ search, status, page })
        if (current) { setResult({ key, data }); setError(false) }
      } catch { if (current) setError(true) }
    }), 200)
    return () => { current = false; clearTimeout(timer) }
  }, [key, search, status, page, result.key])
  const fresh = result.key === key
  const busy = pending || (!fresh && !error)
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-3">
      <Input aria-label="Rechercher un fournisseur" placeholder="Nom, code ou contact" maxLength={200} className="max-w-sm" value={search} onChange={event => { setSearch(event.target.value); setPage(1); setError(false) }} />
      <select aria-label="Activité des fournisseurs" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setError(false) }} className="h-10 rounded-[10px] border bg-background px-3 text-sm">
        <option value="ALL">Tous</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Inactifs</option>
      </select>
    </div>
    <DirectoryPagination total={result.data.total} page={fresh ? result.data.page : page} pending={busy} error={error} onPage={next => { setPage(next); setError(false) }} onRetry={() => { setError(false); setRetry(value => value + 1) }} />
    <div className="divide-y overflow-hidden rounded-xl border bg-card" aria-busy={busy}>
      {fresh ? result.data.items.map(item => <Link key={item.id} href={`/dashboard/operations/fournisseurs/${item.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/25">
        <span className="min-w-0"><span className="block truncate text-sm font-medium">{item.name}</span><span className="text-xs text-muted-foreground">{[item.code, item.contactName].filter(Boolean).join(" · ")}</span></span>
        <Badge variant={item.active ? "secondary" : "outline"}>{item.active ? "Actif" : "Inactif"}</Badge>
      </Link>) : null}
      {fresh && !result.data.items.length ? <p className="p-5 text-sm text-muted-foreground">Aucun fournisseur trouvé.</p> : null}
    </div>
  </section>
}
