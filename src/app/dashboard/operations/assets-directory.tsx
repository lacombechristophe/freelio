"use client"

import Link from "next/link"
import { useOperationsDirectory } from "./use-operations-directory"
import { MapPin } from "lucide-react"
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

export function AssetsDirectory({ agencyId, revision }: { agencyId: string; revision: unknown }) {
  const sites = useOperationsDirectory(agencyId, revision, getCustomerSiteDirectory)
  const equipment = useOperationsDirectory(agencyId, revision, getEquipmentDirectory)
  return <div className="grid gap-6 xl:grid-cols-2">
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Sites clients">
      <div className="space-y-3 border-b px-5 py-4"><h2 className="text-sm font-semibold">Sites clients</h2>
        <Input aria-label="Rechercher un site" placeholder="Rechercher un site" maxLength={200} value={sites.search} onChange={event => sites.setSearch(event.target.value)} />
        <DirectoryPagination total={sites.data?.total ?? 0} page={sites.page} pending={sites.pending} error={sites.error} onPage={sites.setPage} onRetry={sites.retry} />
      </div>
      {sites.visible ? sites.visible.items.length ? <div className="divide-y">{sites.visible.items.map(site => <div key={site.id} className="flex items-center gap-3 px-5 py-3"><MapPin className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{site.client.name} · {site.label}</p><p className="truncate text-xs text-muted-foreground">{site.address1}{site.city ? `, ${site.postalCode || ""} ${site.city}` : ""}</p></div><span className="text-xs tabular-nums text-muted-foreground">{site._count.equipments} équip.</span></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun site.</p> : null}
    </section>
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Parc installé">
      <div className="space-y-3 border-b px-5 py-4"><h2 className="text-sm font-semibold">Parc installé</h2>
        <Input aria-label="Rechercher un équipement" placeholder="Rechercher un équipement" maxLength={200} value={equipment.search} onChange={event => equipment.setSearch(event.target.value)} />
        <DirectoryPagination total={equipment.data?.total ?? 0} page={equipment.page} pending={equipment.pending} error={equipment.error} onPage={equipment.setPage} onRetry={equipment.retry} />
      </div>
      {equipment.visible ? equipment.visible.items.length ? <div className="divide-y">{equipment.visible.items.map(item => <Link key={item.id} href={`/dashboard/service/equipements/${item.id}`} className="block px-5 py-3 hover:bg-muted/35"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium hover:text-primary hover:underline">{item.label}</p><Badge variant="outline">{item.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{item.site.client.name} · {item.site.label}{item.serialNumber ? ` · S/N ${item.serialNumber}` : ""}</p></Link>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun équipement installé.</p> : null}
    </section>
  </div>
}
