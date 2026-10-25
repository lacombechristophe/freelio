"use client"

import { getCustomerOrderDirectory, getActiveReservationDirectory } from "@/actions/operations-orders"
import { consumeStockReservation, releaseStockReservation } from "@/actions/operations"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useOperationsDirectory } from "./use-operations-directory"

type Props = {
  agencyId: string
  revision: unknown
  isPending: boolean
  invoiceOrder: (id: string, mode: "DEPOSIT" | "BALANCE") => void
  mutate: (message: string, action: () => Promise<unknown>) => void
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100)
}

export function OrdersDirectory({ agencyId, revision, isPending, invoiceOrder, mutate }: Props) {
  const orders = useOperationsDirectory(agencyId, revision, getCustomerOrderDirectory)
  const reservations = useOperationsDirectory(agencyId, revision, getActiveReservationDirectory)
  const orderPage = orders.visible
  const reservationPage = reservations.visible

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <section aria-label="Commandes client" className="overflow-hidden rounded-xl border bg-card">
        <div className="space-y-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Commandes client</h2>
          <Input aria-label="Rechercher une commande" placeholder="Rechercher une commande" maxLength={200} value={orders.search} onChange={event => orders.setSearch(event.target.value)} />
          <DirectoryPagination total={orders.data?.total ?? 0} page={orders.page} pending={orders.pending} error={orders.error} onPage={orders.setPage} onRetry={orders.retry} />
        </div>
        {orderPage ? orderPage.items.length ? (
          <div className="divide-y">
            {orderPage.items.map(order => (
              <div key={order.id} className="px-5 py-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-mono text-xs font-semibold">{order.number}</p>
                    <p className="mt-1 text-sm font-medium">{order.client.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{order.project?.name || "Sans chantier"} · {order._count.lines} ligne{order._count.lines > 1 ? "s" : ""} · {order._count.stockReservations} réservation{order._count.stockReservations > 1 ? "s" : ""}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {orderPage.canBillOrders && order.depositCents > 0 && !order.invoices.some(invoice => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED") ? (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "DEPOSIT")}>Facturer l’acompte</Button>
                      ) : null}
                      {orderPage.canBillOrders && order.billingStatus !== "INVOICED" ? (
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "BALANCE")}>Facturer le solde</Button>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Badge variant="outline">{order.status}</Badge>
                      <Badge variant="secondary">{order.billingStatus ?? "Accès Finance requis"}</Badge>
                    </div>
                    <p className="mt-2 text-xs font-medium tabular-nums">{formatMoney(order.totalTtcCents)} TTC</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune commande client.</p> : null}
      </section>
      <section aria-label="Réservations actives" className="overflow-hidden rounded-xl border bg-card">
        <div className="space-y-3 border-b px-5 py-4">
          <h2 className="text-sm font-semibold">Réservations actives</h2>
          <Input aria-label="Rechercher une réservation" placeholder="Rechercher une réservation" maxLength={200} value={reservations.search} onChange={event => reservations.setSearch(event.target.value)} />
          <DirectoryPagination total={reservations.data?.total ?? 0} page={reservations.page} pending={reservations.pending} error={reservations.error} onPage={reservations.setPage} onRetry={reservations.retry} />
        </div>
        {reservationPage ? reservationPage.items.length ? (
          <div className="divide-y">
            {reservationPage.items.map(reservation => (
              <div key={reservation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{reservation.product.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{reservation.quantity} · {reservation.warehouse.name}{reservation.project ? ` · ${reservation.project.name}` : ""}{reservation.customerOrder ? ` · ${reservation.customerOrder.number}` : ""}</p>
                </div>
                {reservationPage.canOperateStocks ? (
                  <div className="flex gap-2">
                    <Button size="sm" disabled={isPending} onClick={() => mutate("Stock consommé pour le dossier.", () => consumeStockReservation(reservation.id))}>Consommer</Button>
                    <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Réservation libérée.", () => releaseStockReservation(reservation.id))}>Libérer</Button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune réservation active.</p> : null}
      </section>
    </div>
  )
}
