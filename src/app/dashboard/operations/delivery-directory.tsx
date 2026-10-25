"use client"

import { useCallback, useState } from "react"
import { FileText, PenLine } from "lucide-react"
import { getDeliveryNoteDirectory } from "@/actions/operations-orders"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useOperationsDirectory } from "./use-operations-directory"

type Props = { agencyId: string; revision: unknown; isPending: boolean; onSign: (id: string) => void }

export function DeliveryDirectory({ agencyId, revision, isPending, onSign }: Props) {
  const [state, setState] = useState<"ALL" | "UNSIGNED" | "SIGNED">("ALL")
  const load = useCallback((query: { search: string; page: number; agencyId?: string }) => getDeliveryNoteDirectory({ ...query, state }), [state])
  const directory = useOperationsDirectory(agencyId, [revision, state], load)
  const page = directory.visible

  return (
    <section aria-label="Bons de livraison" className="mt-6 overflow-hidden rounded-xl border bg-card">
      <div className="space-y-3 border-b px-5 py-4">
        <h2 className="text-sm font-semibold">Bons de livraison</h2>
        <Input aria-label="Rechercher un bon de livraison" placeholder="Rechercher un bon de livraison" maxLength={200} value={directory.search} onChange={event => directory.setSearch(event.target.value)} />
        <select aria-label="État des bons de livraison" className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm" value={state} onChange={event => { setState(event.target.value as typeof state); directory.setPage(1) }}>
          <option value="ALL">Tous</option><option value="UNSIGNED">À signer</option><option value="SIGNED">Signés</option>
        </select>
        <DirectoryPagination total={directory.data?.total ?? 0} page={directory.page} pending={directory.pending} error={directory.error} onPage={directory.setPage} onRetry={directory.retry} />
      </div>
      {page ? page.items.length ? <div className="divide-y">{page.items.map(note => {
        const signed = Boolean(note.signedAt) || note.status === "SIGNED"
        const quantity = note.lines.reduce((sum, line) => sum + line.quantity, 0)
        return <div key={note.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-semibold">{note.number}</p><Badge variant={signed ? "secondary" : "outline"}>{signed ? "Signé" : note.status === "DELIVERED" ? "Livré" : note.status === "DRAFT" ? "Brouillon" : "État à vérifier"}</Badge></div>
            <p className="mt-1 text-xs text-muted-foreground">{note.customerOrder.client.name} · {quantity} unité{quantity > 1 ? "s" : ""}{note.recipientName ? ` · ${note.recipientName}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {page.canManageDeliveries && !signed && note.status === "DELIVERED" ? <Button demoMutation size="sm" onClick={() => onSign(note.id)} disabled={isPending}><PenLine />Faire signer</Button> : null}
            {signed && note.sealVersion !== 1 ? <span className="text-xs text-muted-foreground">Archive historique indisponible</span> : <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/livraison/${note.id}`} target="_blank" rel="noreferrer"><FileText />PDF</a>}
          </div>
        </div>
      })}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun bon de livraison.</p> : null}
    </section>
  )
}
