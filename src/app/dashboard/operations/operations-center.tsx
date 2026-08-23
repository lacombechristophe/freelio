"use client"

import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import { AlertTriangle, Boxes, CalendarDays, ClipboardList, Loader2, MapPin, PackageCheck, Plus, Wrench, type LucideIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import {
  createCustomerSite,
  createEquipment,
  createFieldIntervention,
  createProduct,
  createPurchaseOrder,
  createServiceTicket,
  createStockMovement,
  createSupplier,
  createWarehouse,
  updateInterventionStatus,
  updateServiceTicketStatus,
} from "@/actions/operations"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type OperationsData = Awaited<ReturnType<typeof import("@/actions/operations").getOperationsDashboard>>
type CreateKind = "TICKET" | "INTERVENTION" | "SITE" | "EQUIPMENT" | "PRODUCT" | "SUPPLIER" | "WAREHOUSE" | "STOCK" | "PURCHASE"

const CREATE_LABELS: Record<CreateKind, string> = {
  TICKET: "Ticket SAV",
  INTERVENTION: "Intervention",
  SITE: "Site client",
  EQUIPMENT: "Équipement",
  PRODUCT: "Produit",
  SUPPLIER: "Fournisseur",
  WAREHOUSE: "Dépôt",
  STOCK: "Mouvement de stock",
  PURCHASE: "Commande fournisseur",
}

const PRIORITY_LABELS: Record<string, string> = { LOW: "Faible", NORMAL: "Normale", HIGH: "Haute", URGENT: "Urgente" }
const TICKET_STATUS: Record<string, string> = { OPEN: "Ouvert", QUALIFIED: "Qualifié", PLANNED: "Planifié", WAITING: "En attente", RESOLVED: "Résolu", CLOSED: "Clos" }
const INTERVENTION_STATUS: Record<string, string> = { PLANNED: "Planifiée", EN_ROUTE: "En route", IN_PROGRESS: "En cours", COMPLETED: "Terminée", CANCELED: "Annulée" }

function value(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim()
}

function optional(form: FormData, name: string) {
  return value(form, name) || undefined
}

function isoDate(form: FormData, name: string) {
  const input = value(form, name)
  return input ? new Date(input).toISOString() : undefined
}

function cents(form: FormData, name: string) {
  const amount = Number(value(form, name).replace(/\s/g, "").replace(",", "."))
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

function Field({ label, name, children, required = false }: { label: string; name?: string; children: ReactNode; required?: boolean }) {
  return <div className="space-y-1.5"><Label htmlFor={name}>{label}{required ? " *" : ""}</Label>{children}</div>
}

function NativeSelect({ name, children, required = false }: { name: string; children: ReactNode; required?: boolean }) {
  return <select id={name} name={name} required={required} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"><option value="">Sélectionner…</option>{children}</select>
}

function formatMoney(centsValue: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(centsValue / 100)
}

function formatDate(value: Date | string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—"
}

export function OperationsCenter({ initialData }: { initialData: OperationsData }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [createKind, setCreateKind] = useState<CreateKind>("TICKET")

  const openTickets = initialData.tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length
  const comingInterventions = initialData.interventions.filter((item) => new Date(item.scheduledStart) >= new Date() && !["COMPLETED", "CANCELED"].includes(item.status)).length
  const lowStock = initialData.products.filter((product) => {
    const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0)
    const reorder = product.inventoryItems.reduce((sum, item) => sum + item.reorderPoint, 0)
    return product.stockTracked && quantity - reserved <= reorder
  }).length
  const activeOrders = initialData.purchaseOrders.filter((order) => !["RECEIVED", "CANCELED"].includes(order.status)).length
  const stats: Array<{ icon: LucideIcon; label: string; metric: number; detail: string }> = [
    { icon: Wrench, label: "SAV ouverts", metric: openTickets, detail: "À qualifier ou résoudre" },
    { icon: CalendarDays, label: "Interventions", metric: comingInterventions, detail: "Planifiées à venir" },
    { icon: AlertTriangle, label: "Stocks bas", metric: lowStock, detail: "Disponibles ≤ seuil" },
    { icon: ClipboardList, label: "Achats actifs", metric: activeOrders, detail: "À commander ou recevoir" },
  ]

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    startTransition(async () => {
      try {
        if (createKind === "SITE") await createCustomerSite({ clientId: value(form, "clientId"), label: value(form, "label"), kind: value(form, "kind") || "INSTALLATION", address1: value(form, "address1"), postalCode: optional(form, "postalCode"), city: optional(form, "city"), accessNotes: optional(form, "notes") })
        else if (createKind === "SUPPLIER") await createSupplier({ name: value(form, "name"), code: optional(form, "code"), contactName: optional(form, "contactName"), email: optional(form, "email"), phone: optional(form, "phone"), deliveryDays: optional(form, "deliveryDays") })
        else if (createKind === "PRODUCT") await createProduct({ sku: value(form, "sku"), label: value(form, "label"), supplierId: optional(form, "supplierId"), manufacturer: optional(form, "manufacturer"), family: optional(form, "family"), unit: value(form, "unit") || "unité", purchasePriceCents: cents(form, "purchasePrice"), salePriceCents: cents(form, "salePrice"), stockTracked: true })
        else if (createKind === "WAREHOUSE") await createWarehouse({ name: value(form, "name"), code: value(form, "code"), address: optional(form, "address") })
        else if (createKind === "EQUIPMENT") await createEquipment({ siteId: value(form, "siteId"), productId: optional(form, "productId"), label: value(form, "label"), category: optional(form, "category"), manufacturer: optional(form, "manufacturer"), model: optional(form, "model"), serialNumber: optional(form, "serialNumber"), installedAt: isoDate(form, "installedAt"), warrantyUntil: isoDate(form, "warrantyUntil"), notes: optional(form, "notes") })
        else if (createKind === "TICKET") await createServiceTicket({ clientId: value(form, "clientId"), siteId: optional(form, "siteId"), equipmentId: optional(form, "equipmentId"), assignedMembershipId: optional(form, "assignedMembershipId"), title: value(form, "title"), description: value(form, "description"), type: value(form, "type") || "SAV", priority: value(form, "priority") || "NORMAL", dueAt: isoDate(form, "dueAt") })
        else if (createKind === "INTERVENTION") await createFieldIntervention({ ticketId: optional(form, "ticketId"), projectId: optional(form, "projectId"), siteId: value(form, "siteId"), assignedMembershipId: optional(form, "assignedMembershipId"), title: value(form, "title"), type: value(form, "type") || "SAV", scheduledStart: isoDate(form, "scheduledStart"), scheduledEnd: isoDate(form, "scheduledEnd") })
        else if (createKind === "STOCK") await createStockMovement({ warehouseId: value(form, "warehouseId"), productId: value(form, "productId"), projectId: optional(form, "projectId"), type: value(form, "type"), quantity: Number(value(form, "quantity")), unitCostCents: cents(form, "unitCost"), reference: optional(form, "reference"), notes: optional(form, "notes") })
        else await createPurchaseOrder({ supplierId: value(form, "supplierId"), projectId: optional(form, "projectId"), expectedAt: isoDate(form, "expectedAt"), notes: optional(form, "notes"), productId: optional(form, "productId"), label: value(form, "label"), quantity: Number(value(form, "quantity")), unitPriceCents: cents(form, "unitPrice") })
        toast.success(`${CREATE_LABELS[createKind]} enregistré.`)
        formElement.reset()
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Enregistrement impossible.")
      }
    })
  }

  function mutate(message: string, operation: () => Promise<unknown>) {
    startTransition(async () => {
      try { await operation(); toast.success(message); router.refresh() }
      catch (error) { toast.error(error instanceof Error ? error.message : "Mise à jour impossible.") }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ icon: Icon, label, metric, detail }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold tabular-nums">{metric}</p><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>)}
      </div>

      <Card>
        <CardHeader className="pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4 text-primary" />Créer une opération</CardTitle><CardDescription>Les rattachements sont contrôlés côté serveur avant chaque écriture.</CardDescription></div><div className="w-full lg:w-64"><Select value={createKind} onValueChange={(next) => setCreateKind(next as CreateKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CREATE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div></CardHeader>
        <CardContent><form key={createKind} onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{renderForm(createKind, initialData)}<div className="flex items-end"><Button type="submit" disabled={isPending} className="w-full sm:w-auto">{isPending ? <Loader2 className="animate-spin" /> : <Plus />}Enregistrer</Button></div></form></CardContent>
      </Card>

      <Tabs defaultValue="sav" className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="sav"><Wrench />SAV</TabsTrigger><TabsTrigger value="planning"><CalendarDays />Planning</TabsTrigger><TabsTrigger value="stock"><Boxes />Stock & achats</TabsTrigger><TabsTrigger value="assets"><PackageCheck />Sites & parc</TabsTrigger></TabsList>
        <TabsContent value="sav"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Tickets SAV</h2></div>{initialData.tickets.length ? <div className="divide-y">{initialData.tickets.map((ticket) => <div key={ticket.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><code className="text-xs font-semibold">{ticket.number}</code><Badge variant={ticket.priority === "URGENT" ? "destructive" : "outline"}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge><Badge variant={ticket.status === "CLOSED" ? "secondary" : "outline"}>{TICKET_STATUS[ticket.status] ?? ticket.status}</Badge></div><p className="mt-2 text-sm font-semibold">{ticket.title}</p><p className="mt-1 text-xs text-muted-foreground">{ticket.client.name}{ticket.site ? ` · ${ticket.site.label}` : ""}{ticket.equipment ? ` · ${ticket.equipment.label}` : ""} · {ticket._count.interventions} intervention{ticket._count.interventions > 1 ? "s" : ""}</p></div><div className="flex gap-2">{!['RESOLVED','CLOSED'].includes(ticket.status) ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Ticket résolu.", () => updateServiceTicketStatus(ticket.id, "RESOLVED"))}>Résoudre</Button> : null}{ticket.status === "RESOLVED" ? <Button size="sm" disabled={isPending} onClick={() => mutate("Ticket clos.", () => updateServiceTicketStatus(ticket.id, "CLOSED"))}>Clore</Button> : null}</div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun ticket SAV.</p>}</section></TabsContent>
        <TabsContent value="planning"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Planning terrain</h2></div>{initialData.interventions.length ? <div className="divide-y">{initialData.interventions.map((item) => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.status === "COMPLETED" ? "secondary" : "outline"}>{INTERVENTION_STATUS[item.status] ?? item.status}</Badge><span className="text-xs font-medium tabular-nums">{formatDate(item.scheduledStart)}</span></div><p className="mt-2 text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.site.client.name} · {item.site.label}{item.ticket ? ` · ${item.ticket.number}` : ""}{item.assignedMembership ? ` · ${item.assignedMembership.user.name || item.assignedMembership.user.email}` : ""}</p></div><div className="flex gap-2">{item.status === "PLANNED" ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Intervention démarrée.", () => updateInterventionStatus(item.id, "IN_PROGRESS"))}>Démarrer</Button> : null}{item.status === "IN_PROGRESS" ? <Button size="sm" disabled={isPending} onClick={() => mutate("Intervention terminée.", () => updateInterventionStatus(item.id, "COMPLETED"))}>Terminer</Button> : null}</div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune intervention planifiée.</p>}</section></TabsContent>
        <TabsContent value="stock"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Stock par produit</h2></div>{initialData.products.length ? <div className="divide-y">{initialData.products.map((product) => { const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0); const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0); return <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-medium">{product.label}</p><p className="font-mono text-[11px] text-muted-foreground">{product.sku}{product.supplier ? ` · ${product.supplier.name}` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{quantity - reserved} disponible{quantity - reserved > 1 ? "s" : ""}</p><p className="text-xs text-muted-foreground">{reserved} réservé{reserved > 1 ? "s" : ""}</p></div></div>})}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Catalogue produit vide.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Commandes fournisseur</h2></div>{initialData.purchaseOrders.length ? <div className="divide-y">{initialData.purchaseOrders.map((order) => <div key={order.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="font-mono text-xs font-semibold">{order.number}</p><p className="mt-1 text-xs text-muted-foreground">{order.supplier.name}{order.project ? ` · ${order.project.name}` : ""}</p></div><div className="text-right"><Badge variant="outline">{order.status}</Badge><p className="mt-1 text-xs font-medium tabular-nums">{formatMoney(order.totalHtCents)} HT</p></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune commande.</p>}</section></div></TabsContent>
        <TabsContent value="assets"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Sites clients</h2></div>{initialData.sites.length ? <div className="divide-y">{initialData.sites.map((site) => <div key={site.id} className="flex items-center gap-3 px-5 py-3"><MapPin className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{site.client.name} · {site.label}</p><p className="truncate text-xs text-muted-foreground">{site.address1}{site.city ? `, ${site.postalCode || ""} ${site.city}` : ""}</p></div><span className="text-xs tabular-nums text-muted-foreground">{site._count.equipments} équip.</span></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun site.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Parc installé</h2></div>{initialData.equipments.length ? <div className="divide-y">{initialData.equipments.map((equipment) => <div key={equipment.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{equipment.label}</p><Badge variant="outline">{equipment.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{equipment.site.client.name} · {equipment.site.label}{equipment.serialNumber ? ` · S/N ${equipment.serialNumber}` : ""}</p></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun équipement installé.</p>}</section></div></TabsContent>
      </Tabs>
    </div>
  )
}

function renderForm(kind: CreateKind, data: OperationsData) {
  const clients = <>{data.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</>
  const sites = <>{data.sites.map((site) => <option key={site.id} value={site.id}>{site.client.name} · {site.label}</option>)}</>
  const products = <>{data.products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}</>
  const suppliers = <>{data.suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</>
  const projects = <>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</>
  const members = <>{data.members.map((member) => <option key={member.id} value={member.id}>{member.user.name || member.user.email}</option>)}</>
  if (kind === "SITE") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Libellé" name="label" required><Input id="label" name="label" required placeholder="Domicile / Résidence secondaire" /></Field><Field label="Adresse" name="address1" required><Input id="address1" name="address1" required /></Field><Field label="Ville" name="city"><Input id="city" name="city" /></Field></>
  if (kind === "SUPPLIER") return <><Field label="Nom" name="name" required><Input id="name" name="name" required /></Field><Field label="Code" name="code"><Input id="code" name="code" /></Field><Field label="Contact" name="contactName"><Input id="contactName" name="contactName" /></Field><Field label="E-mail" name="email"><Input id="email" name="email" type="email" /></Field></>
  if (kind === "PRODUCT") return <><Field label="Référence / SKU" name="sku" required><Input id="sku" name="sku" required /></Field><Field label="Produit" name="label" required><Input id="label" name="label" required /></Field><Field label="Fournisseur" name="supplierId"><NativeSelect name="supplierId">{suppliers}</NativeSelect></Field><Field label="Famille" name="family"><Input id="family" name="family" placeholder="Pompe, filtration, traitement…" /></Field><Field label="Coût HT (€)" name="purchasePrice"><Input id="purchasePrice" name="purchasePrice" inputMode="decimal" /></Field><Field label="Prix de vente HT (€)" name="salePrice"><Input id="salePrice" name="salePrice" inputMode="decimal" /></Field></>
  if (kind === "WAREHOUSE") return <><Field label="Nom du dépôt" name="name" required><Input id="name" name="name" required /></Field><Field label="Code" name="code" required><Input id="code" name="code" required /></Field><Field label="Adresse" name="address"><Input id="address" name="address" /></Field></>
  if (kind === "EQUIPMENT") return <><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Équipement" name="label" required><Input id="label" name="label" required /></Field><Field label="Produit catalogue" name="productId"><NativeSelect name="productId">{products}</NativeSelect></Field><Field label="N° de série" name="serialNumber"><Input id="serialNumber" name="serialNumber" /></Field><Field label="Installé le" name="installedAt"><Input id="installedAt" name="installedAt" type="date" /></Field><Field label="Garantie jusqu'au" name="warrantyUntil"><Input id="warrantyUntil" name="warrantyUntil" type="date" /></Field></>
  if (kind === "TICKET") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Site" name="siteId"><NativeSelect name="siteId">{sites}</NativeSelect></Field><Field label="Équipement" name="equipmentId"><NativeSelect name="equipmentId">{data.equipments.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.site.client.name} · {equipment.label}</option>)}</NativeSelect></Field><Field label="Assigné à" name="assignedMembershipId"><NativeSelect name="assignedMembershipId">{members}</NativeSelect></Field><Field label="Objet" name="title" required><Input id="title" name="title" required /></Field><Field label="Description" name="description" required><Input id="description" name="description" required /></Field><Field label="Priorité" name="priority"><NativeSelect name="priority"><option value="NORMAL">Normale</option><option value="HIGH">Haute</option><option value="URGENT">Urgente</option><option value="LOW">Faible</option></NativeSelect></Field><Field label="Échéance" name="dueAt"><Input id="dueAt" name="dueAt" type="datetime-local" /></Field></>
  if (kind === "INTERVENTION") return <><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Ticket SAV" name="ticketId"><NativeSelect name="ticketId">{data.tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.number} · {ticket.title}</option>)}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Intervenant" name="assignedMembershipId"><NativeSelect name="assignedMembershipId">{members}</NativeSelect></Field><Field label="Objet" name="title" required><Input id="title" name="title" required /></Field><Field label="Début" name="scheduledStart" required><Input id="scheduledStart" name="scheduledStart" type="datetime-local" required /></Field><Field label="Fin prévue" name="scheduledEnd"><Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" /></Field></>
  if (kind === "STOCK") return <><Field label="Dépôt" name="warehouseId" required><NativeSelect name="warehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="productId" required><NativeSelect name="productId" required>{products}</NativeSelect></Field><Field label="Mouvement" name="type" required><NativeSelect name="type" required><option value="IN">Entrée</option><option value="OUT">Sortie</option><option value="RESERVE">Réserver chantier</option><option value="RELEASE">Libérer réservation</option><option value="CONSUME">Consommer</option><option value="ADJUST">Ajustement signé</option></NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" required defaultValue="1" /></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Référence" name="reference"><Input id="reference" name="reference" /></Field></>
  return <><Field label="Fournisseur" name="supplierId" required><NativeSelect name="supplierId" required>{suppliers}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Produit" name="productId"><NativeSelect name="productId">{products}</NativeSelect></Field><Field label="Libellé" name="label" required><Input id="label" name="label" required /></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required /></Field><Field label="Prix unitaire HT (€)" name="unitPrice" required><Input id="unitPrice" name="unitPrice" inputMode="decimal" required /></Field><Field label="Livraison prévue" name="expectedAt"><Input id="expectedAt" name="expectedAt" type="date" /></Field></>
}
