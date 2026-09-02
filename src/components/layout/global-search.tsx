"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, LoaderCircle, Search, SearchX } from "lucide-react"
import {
  Dialog, DialogContent, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { globalSearch } from "@/actions/search"
import { cn } from "@/lib/utils"

type Result = { id: string; label: string; type: string; href: string }

export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<Result[]>([])
  const [loading, setLoading] = React.useState(false)

  // Cmd+K / Ctrl+K
  React.useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  React.useEffect(() => {
    if (!query || query.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const r = await globalSearch(query)
        setResults((r ?? []) as Result[])
      } finally {
        setLoading(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  function goto(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir la recherche globale"
        className="ml-auto flex h-9 w-9 items-center justify-center gap-2 rounded-[9px] border border-border bg-[#fbfcfe] text-sm text-muted-foreground shadow-[0_1px_2px_rgba(13,36,66,0.025)] transition-colors hover:border-input hover:bg-muted sm:ml-0 sm:w-full sm:max-w-[460px] sm:justify-start sm:px-3 dark:bg-background"
      >
        <Search className="size-4" />
        <span className="hidden truncate sm:inline">Rechercher un client, un projet, une facture…</span>
        <kbd className="ml-auto hidden rounded-md border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">Ctrl K</kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-xl" showCloseButton={false}>
          <DialogTitle className="sr-only">Recherche globale</DialogTitle>
          <div className="flex items-center border-b px-4">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              className="h-14 border-0 bg-transparent shadow-none focus-visible:ring-0"
              placeholder="Rechercher clients, contacts, dossiers, tickets, campagnes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-[420px] min-h-36 overflow-y-auto p-2">
            {query.length < 2 ? (
              <div className="grid min-h-32 place-items-center px-4 text-center"><div><Search className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-medium">Recherchez dans tout l’espace</p><p className="mt-1 text-xs text-muted-foreground">Clients, contacts, documents, tickets, équipements et campagnes.</p></div></div>
            ) : loading ? (
              <div className="grid min-h-32 place-items-center"><LoaderCircle className="size-5 animate-spin text-primary" /><span className="sr-only">Recherche en cours</span></div>
            ) : results.length === 0 ? (
              <div className="grid min-h-32 place-items-center px-4 text-center"><div><SearchX className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-sm font-medium">Aucun résultat</p><p className="mt-1 text-xs text-muted-foreground">Essayez un nom, un numéro ou un terme plus court.</p></div></div>
            ) : (
              <ul>
                {results.map((r) => (
                  <li key={`${r.type}-${r.id}`}>
                    <button
                      onClick={() => goto(r.href)}
                      className={cn(
                        "flex min-h-12 w-full items-center justify-between gap-3 rounded-lg px-3 text-left transition-colors hover:bg-muted"
                      )}
                    >
                      <span className="font-medium text-sm truncate">{r.label}</span>
                      <span className="ml-auto shrink-0 rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">{r.type}</span>
                      <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
