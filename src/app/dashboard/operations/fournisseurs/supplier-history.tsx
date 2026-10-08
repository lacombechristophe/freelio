"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import { PackageCheck, RotateCcw } from "lucide-react"
import { getSupplierProductHistory, getSupplierOrderHistory, getSupplierReturnHistory } from "@/actions/suppliers"
import { EmptyRecord, formatRecordDate, formatRecordMoney } from "@/app/dashboard/operations/_components/record-ui"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DirectoryPagination } from "@/components/shared/directory-pagination"

function useHistory<T extends { total: number; page: number }>(supplierId: string, initial: T, load: (supplierId: string, query: { search: string; page: number }) => Promise<T>) {
  const [search, setSearchValue] = useState("")
  const [page, setPage] = useState(initial.page)
  const [retryCount, setRetryCount] = useState(0)
  const [state, setState] = useState({ data: initial, key: JSON.stringify([supplierId, "", initial.page, 0]), error: false })
  const [pending, startTransition] = useTransition()
  const key = JSON.stringify([supplierId, search, page, retryCount])
  useEffect(() => {
    if (state.key === key) return
    let ignore = false
    const timer = setTimeout(() => startTransition(async () => {
      try {
        const data = await load(supplierId, { search, page })
        if (!ignore) setState({ data, key, error: false })
      } catch {
        if (!ignore) setState(previous => ({ ...previous, key, error: true }))
      }
    }), 200)
    return () => { ignore = true; clearTimeout(timer) }
  }, [supplierId, search, page, key, state.key, load])
  const current = state.key === key
  return { search, setSearch: (value: string) => { setSearchValue(value); setPage(1) }, setPage, retry: () => setRetryCount(value => value + 1), data: state.data, pending: pending || !current, error: current && state.error, visible: current && !state.error ? state.data : null }
}

export function SupplierProductHistory({ supplierId, initial }: { supplierId: string; initial: Awaited<ReturnType<typeof getSupplierProductHistory>> }) {
  const history = useHistory(supplierId, initial, getSupplierProductHistory)
  const result = history.visible
  return (
    <Card role="region" aria-label="Catalogue fournisseur">
      <CardHeader>
        <CardTitle className="text-base">Catalogue fournisseur</CardTitle>
        <CardDescription>
          Prix d’achat et disponibilité interne.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input aria-label="Rechercher dans catalogue fournisseur" placeholder="Rechercher…" maxLength={200} value={history.search} onChange={event => history.setSearch(event.target.value)} />
        <DirectoryPagination total={history.data.total} page={history.data.page} pending={history.pending} error={history.error} onPage={history.setPage} onRetry={history.retry} />
        {result ? <>
        {result.items.length ? (
          <div className="divide-y rounded-lg border">
            {result.items.map((product) => {
              const quantity = product.inventoryItems.reduce(
                (sum, item) =>
                  sum + item.quantity - item.reservedQuantity,
                0,
              );
              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {product.sku} · {product.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {product.family || "Sans famille"} ·{" "}
                      {formatRecordMoney(product.purchasePriceCents)} HT
                    </span>
                  </span>
                  <Badge
                    variant={quantity <= 0 ? "destructive" : "outline"}
                  >
                    {quantity} dispo.
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyRecord>
            Aucun produit rattaché à ce fournisseur.
          </EmptyRecord>
        )}
      </> : null}
      </CardContent>
    </Card>
  )
}

export function SupplierOrderHistory({ supplierId, initial }: { supplierId: string; initial: Awaited<ReturnType<typeof getSupplierOrderHistory>> }) {
  const history = useHistory(supplierId, initial, getSupplierOrderHistory)
  const result = history.visible
  return (
    <Card role="region" aria-label="Historique des commandes">
      <CardHeader>
        <CardTitle className="text-base">
          Historique des commandes
        </CardTitle>
        <CardDescription>
          Montants, délais, reliquats et qualité fournisseur.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input aria-label="Rechercher dans historique des commandes" placeholder="Rechercher…" maxLength={200} value={history.search} onChange={event => history.setSearch(event.target.value)} />
        <DirectoryPagination total={history.data.total} page={history.data.page} pending={history.pending} error={history.error} onPage={history.setPage} onRetry={history.retry} />
        {result ? <>
        {result.items.length ? (
          <div className="space-y-3">
            {result.items.map((order) => {
              const remaining = order.lines.reduce(
                (sum, line) =>
                  sum +
                  Math.max(
                    0,
                    line.quantity -
                      line.receivedQuantity -
                      line.creditedQuantity,
                  ),
                0,
              );
              return (
                <Link
                  key={order.id}
                  href={`/dashboard/operations/achats/${order.id}`}
                  className="block rounded-lg border p-4 hover:border-primary/30 hover:bg-muted/25"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">
                      {order.number}
                    </span>
                    <Badge
                      variant={
                        order.issues.some(
                          (issue) => issue.status !== "RESOLVED",
                        )
                          ? "destructive"
                          : order.status === "RECEIVED"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {order.status}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {order.project?.name ||
                          "Approvisionnement général"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Commandée le {formatRecordDate(order.orderDate)} ·{" "}
                        {remaining} unité(s) en reliquat
                      </p>
                    </div>
                    <strong className="tabular-nums">
                      {formatRecordMoney(order.totalHtCents)}
                    </strong>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyRecord>Aucune commande fournisseur.</EmptyRecord>
        )}
      </> : null}
      </CardContent>
    </Card>
  )
}

export function SupplierReturnHistory({ supplierId, initial }: { supplierId: string; initial: Awaited<ReturnType<typeof getSupplierReturnHistory>> }) {
  const history = useHistory(supplierId, initial, getSupplierReturnHistory)
  const result = history.visible
  return (
    <Card role="region" aria-label="Retours et avoirs">
      <CardHeader>
        <CardTitle className="text-base">Retours et avoirs</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input aria-label="Rechercher dans retours et avoirs" placeholder="Rechercher…" maxLength={200} value={history.search} onChange={event => history.setSearch(event.target.value)} />
        <DirectoryPagination total={history.data.total} page={history.data.page} pending={history.pending} error={history.error} onPage={history.setPage} onRetry={history.retry} />
        {result ? <>
        {result.items.length ? (
          <div className="space-y-3">
            {result.items.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    <RotateCcw className="mr-2 inline size-4" />
                    {item.number}
                  </span>
                  <Badge
                    variant={
                      item.status === "CREDITED" ? "secondary" : "outline"
                    }
                  >
                    {item.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.quantity} × {item.product.sku} ·{" "}
                  {item.product.label} · {item.warehouse.name}
                </p>
                <p className="mt-2 text-xs">
                  {item.reason}
                  {item.creditReference
                    ? ` · Avoir ${item.creditReference}`
                    : ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg bg-success/5 p-4 text-sm">
            <PackageCheck className="size-5 text-success" />
            Aucun retour fournisseur.
          </div>
        )}
      </> : null}
      </CardContent>
    </Card>
  )
}
