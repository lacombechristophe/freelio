"use client"

import Link from "next/link"
import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useOperationsDirectory } from "./use-operations-directory"
import { MapPin } from "lucide-react"
import { getCustomerSiteDirectory, getEquipmentDirectory } from "@/actions/operations-assets"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { SiteEditorDialog, EquipmentEditorDialog, AssetActivityDialog, type SiteEditorRecord, type EquipmentEditorRecord, type AssetActivityRecord } from "./asset-editors"
import { SiteTransferDialog } from "./site-transfer-dialog"

type Query = { search: string; page: number; agencyId?: string }

export function AssetsDirectory({ agencyId, revision }: { agencyId: string; revision: unknown }) {
  const router = useRouter()
  const [siteStatus, setSiteStatus] = useState("ALL")
  const [equipmentStatus, setEquipmentStatus] = useState("ALL")
  const loadSites = useCallback((query: Query) => getCustomerSiteDirectory({ ...query, status: siteStatus }), [siteStatus])
  const loadEquipment = useCallback((query: Query) => getEquipmentDirectory({ ...query, status: equipmentStatus }), [equipmentStatus])
  const sites = useOperationsDirectory(agencyId, JSON.stringify([revision, siteStatus]), loadSites)
  const equipment = useOperationsDirectory(agencyId, JSON.stringify([revision, equipmentStatus]), loadEquipment)
  // Captured forms outlive directory page changes and background refreshes.
  const [siteEditor, setSiteEditor] = useState<SiteEditorRecord | null>(null)
  const [equipmentEditor, setEquipmentEditor] = useState<EquipmentEditorRecord | null>(null)
  const [activity, setActivity] = useState<AssetActivityRecord | null>(null)
  const [transfer, setTransfer] = useState<SiteEditorRecord | null>(null)
  function refresh() { sites.retry(); equipment.retry(); router.refresh() }
  return <><div className="grid gap-6 xl:grid-cols-2">
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Sites clients">
      <div className="space-y-3 border-b px-5 py-4"><h2 className="text-sm font-semibold">Sites clients</h2>
        <Input aria-label="Rechercher un site" placeholder="Rechercher un site" maxLength={200} value={sites.search} onChange={event => sites.setSearch(event.target.value)} />
        <select aria-label="Référencement des sites" value={siteStatus} onChange={event => { setSiteStatus(event.target.value); sites.setPage(1) }} className="h-10 rounded-[10px] border bg-background px-3 text-sm">
          <option value="ALL">Tous</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Désactivés</option>
        </select>
        <DirectoryPagination total={sites.data?.total ?? 0} page={sites.page} pending={sites.pending} error={sites.error} onPage={sites.setPage} onRetry={sites.retry} />
      </div>
      {sites.visible ? sites.visible.items.length ? <div className="divide-y">{sites.visible.items.map(site => <article key={site.id} aria-label={site.label}>
        <div className="flex items-center gap-3 px-5 py-3"><MapPin className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{site.client.name} · {site.label}</p><p className="truncate text-xs text-muted-foreground">{site.address1}{site.city ? `, ${site.postalCode || ""} ${site.city}` : ""}</p>
          {site.archivedAt ? <Badge variant="outline" className="mt-1">Référencement désactivé</Badge> : null}
        </div><span className="text-xs tabular-nums text-muted-foreground">{site._count.equipments} équip.</span></div>
        {sites.visible?.canManage ? <div className="flex flex-wrap gap-2 px-5 pb-3"><Button demoMutation size="sm" variant="outline" onClick={() => setSiteEditor(site)}>Modifier</Button><Button demoMutation size="sm" variant="outline" onClick={() => setActivity({ ...site, kind: "site" })}>{site.archivedAt ? "Réactiver" : "Désactiver"}</Button></div> : null}
        {sites.visible?.canTransfer ? <div className="px-5 pb-3"><Button demoMutation size="sm" variant="outline" onClick={() => setTransfer(site)}>Transférer vers une agence</Button></div> : null}
      </article>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun site.</p> : null}
    </section>
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="Parc installé">
      <div className="space-y-3 border-b px-5 py-4"><h2 className="text-sm font-semibold">Parc installé</h2>
        <Input aria-label="Rechercher un équipement" placeholder="Rechercher un équipement" maxLength={200} value={equipment.search} onChange={event => equipment.setSearch(event.target.value)} />
        <select aria-label="Référencement des équipements" value={equipmentStatus} onChange={event => { setEquipmentStatus(event.target.value); equipment.setPage(1) }} className="h-10 rounded-[10px] border bg-background px-3 text-sm">
          <option value="ALL">Tous</option><option value="ACTIVE">Actifs</option><option value="INACTIVE">Désactivés</option>
        </select>
        <DirectoryPagination total={equipment.data?.total ?? 0} page={equipment.page} pending={equipment.pending} error={equipment.error} onPage={equipment.setPage} onRetry={equipment.retry} />
      </div>
      {equipment.visible ? equipment.visible.items.length ? <div className="divide-y">{equipment.visible.items.map(item => <article key={item.id} aria-label={item.label}>
        <Link href={`/dashboard/service/equipements/${item.id}`} className="block px-5 py-3 hover:bg-muted/35"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-medium hover:text-primary hover:underline">{item.label}</p><div className="flex flex-wrap gap-2"><Badge variant="outline">{item.status}</Badge>{item.archivedAt ? <Badge variant="outline">Référencement désactivé</Badge> : null}</div></div><p className="mt-1 text-xs text-muted-foreground">{item.site.client.name} · {item.site.label}{item.serialNumber ? ` · S/N ${item.serialNumber}` : ""}</p></Link>
        {equipment.visible?.canManage ? <div className="flex flex-wrap gap-2 px-5 pb-3"><Button demoMutation size="sm" variant="outline" onClick={() => setEquipmentEditor(item)}>Modifier</Button><Button demoMutation size="sm" variant="outline" onClick={() => setActivity({ ...item, kind: "equipment" })}>{item.archivedAt ? "Réactiver" : "Désactiver"}</Button></div> : null}
      </article>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun équipement installé.</p> : null}
    </section>
  </div>
    {siteEditor ? <SiteEditorDialog site={siteEditor} onClose={() => setSiteEditor(null)} onSaved={refresh} /> : null}
    {equipmentEditor ? <EquipmentEditorDialog equipment={equipmentEditor} onClose={() => setEquipmentEditor(null)} onSaved={refresh} /> : null}
    {activity ? <AssetActivityDialog record={activity} onClose={() => setActivity(null)} onSaved={refresh} /> : null}
    {transfer ? <SiteTransferDialog site={transfer} onClose={() => setTransfer(null)} onSaved={refresh} /> : null}
  </>
}
