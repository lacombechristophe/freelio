"use client"

import { getOperationsStockDirectory } from "@/actions/operations-stock"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Input } from "@/components/ui/input"
import { useOperationsDirectory } from "./use-operations-directory"

type StockPage = Awaited<ReturnType<typeof getOperationsStockDirectory>>

export function StockDirectory({ directory }: { directory: ReturnType<typeof useOperationsDirectory<StockPage>> }) {
  const data = directory.visible
  return <section aria-label="Stock par produit" className="overflow-hidden rounded-xl border bg-card">
    <div className="space-y-3 border-b px-5 py-4">
      <h2 className="text-sm font-semibold">Stock par produit</h2>
      <Input aria-label="Rechercher dans le stock" placeholder="Rechercher une référence ou un libellé…" maxLength={200} value={directory.search} onChange={event => directory.setSearch(event.target.value)} />
      <DirectoryPagination total={directory.data?.total ?? 0} page={directory.page} pending={directory.pending} error={directory.error} onPage={directory.setPage} onRetry={directory.retry} />
    </div>
    {data ? data.items.length ? <div className="divide-y">{data.items.map(product => <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-3">
      <div><p className="text-sm font-medium">{product.label}</p><p className="font-mono text-[11px] text-muted-foreground">{product.sku}{product.supplier ? ` · ${product.supplier.name}` : ""}</p></div>
      <div className="text-right"><p className="text-sm font-semibold tabular-nums">{product.available === null ? "Valeur indisponible" : `${product.available} disponible${product.available > 1 ? "s" : ""}`}</p><p className="text-xs text-muted-foreground">{product.reserved === null ? "Valeur indisponible" : `${product.reserved} réservé${product.reserved > 1 ? "s" : ""}`}</p></div>
    </div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Catalogue produit vide.</p> : null}
  </section>
}
