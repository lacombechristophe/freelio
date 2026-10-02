"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

export function DirectoryPagination({ total, page, pending, error, onPage, onRetry }: {
  total: number; page: number; pending: boolean; error: boolean; onPage: (page: number) => void; onRetry: () => void
}) {
  const pages = Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE))
  return <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
    <p role="status" className="text-muted-foreground">{pending ? "Actualisation…" : `${total.toLocaleString("fr-FR")} résultat${total === 1 ? "" : "s"}`}</p>
    {error ? <div role="alert" className="flex flex-wrap items-center gap-2 text-danger">Impossible d’actualiser la liste.<Button variant="outline" onClick={onRetry}>Réessayer</Button></div> : null}
    <nav aria-label="Pagination" className="flex items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Page précédente" disabled={pending || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft /></Button>
      <span className="tabular-nums">Page {page} sur {pages}</span>
      <Button variant="outline" size="icon" aria-label="Page suivante" disabled={pending || page >= pages} onClick={() => onPage(page + 1)}><ChevronRight /></Button>
    </nav>
  </div>
}
