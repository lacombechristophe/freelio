"use client"

import { useState, useTransition, type FormEvent, type ReactNode } from "react"
import { AlertTriangle, Boxes, CalendarDays, ClipboardCheck, ClipboardList, FileImage, FileText, Loader2, MapPin, PackageCheck, PackageMinus, PenLine, Plus, Trash2, Upload, Wrench, type LucideIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"

import {
  createCustomerSite,
  createCustomerOrder,
  createInvoiceFromCustomerOrder,
  createMaintenanceContract,
  createDeliveryNote,
  createEquipment,
  createFieldIntervention,
  createProduct,
  createServiceTicket,
  createStockMovement,
  createSupplier,
  createWarehouse,
  consumeStockReservation,
  consumeInterventionMaterial,
  completeFieldIntervention,
  releaseStockReservation,
  reserveStock,
  signDeliveryNote,
  updateInterventionStatus,
  updateServiceTicketStatus,
} from "@/actions/operations"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PurchaseWorkflow } from "./purchase-workflow"

type OperationsData = Awaited<ReturnType<typeof import("@/actions/operations").getOperationsDashboard>>
type CreateKind = "TICKET" | "INTERVENTION" | "MAINTENANCE" | "SITE" | "EQUIPMENT" | "PRODUCT" | "SUPPLIER" | "WAREHOUSE" | "STOCK" | "CUSTOMER_ORDER" | "RESERVATION" | "DELIVERY"

const CREATE_LABELS: Record<CreateKind, string> = {
  TICKET: "Ticket SAV",
  INTERVENTION: "Intervention",
  MAINTENANCE: "Contrat d’entretien",
  SITE: "Site client",
  EQUIPMENT: "Équipement",
  PRODUCT: "Produit",
  SUPPLIER: "Fournisseur",
  WAREHOUSE: "Dépôt",
  STOCK: "Mouvement de stock",
  CUSTOMER_ORDER: "Commande client",
  RESERVATION: "Réservation de stock",
  DELIVERY: "Bon de livraison",
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
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [createKind, setCreateKind] = useState<CreateKind>("TICKET")
  const [completionId, setCompletionId] = useState<string | null>(null)
  const [deliverySignId, setDeliverySignId] = useState<string | null>(null)
  const [materialInterventionId, setMaterialInterventionId] = useState<string | null>(null)

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
        else if (createKind === "MAINTENANCE") await createMaintenanceContract({ clientId: value(form, "clientId"), siteId: value(form, "siteId"), label: value(form, "label"), startDate: value(form, "startDate"), endDate: optional(form, "endDate"), frequency: value(form, "frequency") || "ANNUAL", nextVisitAt: optional(form, "nextVisitAt"), priceCents: cents(form, "price"), autoInvoice: form.get("autoInvoice") === "on", tvaRate: Number(value(form, "tvaRate") || "20"), invoiceDueDays: Number(value(form, "invoiceDueDays") || "30"), equipmentIds: optional(form, "equipmentId") ? [value(form, "equipmentId")] : [], notes: optional(form, "notes") })
        else if (createKind === "STOCK") await createStockMovement({ warehouseId: value(form, "warehouseId"), productId: value(form, "productId"), projectId: optional(form, "projectId"), type: value(form, "type"), quantity: Number(value(form, "quantity")), unitCostCents: cents(form, "unitCost"), reference: optional(form, "reference"), notes: optional(form, "notes") })
        else if (createKind === "CUSTOMER_ORDER") await createCustomerOrder({ clientId: value(form, "clientId"), projectId: optional(form, "projectId"), expectedInstallationAt: isoDate(form, "expectedInstallationAt"), notes: optional(form, "notes"), productId: optional(form, "productId"), label: value(form, "label"), quantity: Number(value(form, "quantity")), unitPriceCents: cents(form, "unitPrice"), tvaRate: Number(value(form, "tvaRate") || "20"), depositCents: cents(form, "deposit") })
        else if (createKind === "RESERVATION") await reserveStock({ warehouseId: value(form, "warehouseId"), productId: value(form, "productId"), projectId: optional(form, "projectId"), customerOrderId: optional(form, "customerOrderId"), quantity: Number(value(form, "quantity")), notes: optional(form, "notes") })
        else if (createKind === "DELIVERY") await createDeliveryNote({ customerOrderId: value(form, "customerOrderId"), customerOrderLineId: value(form, "customerOrderLineId"), quantity: Number(value(form, "quantity")), recipientName: optional(form, "recipientName"), notes: optional(form, "notes") })
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

  function invoiceOrder(customerOrderId: string, mode: "DEPOSIT" | "BALANCE") {
    startTransition(async () => {
      try {
        const result = await createInvoiceFromCustomerOrder({ customerOrderId, mode })
        toast.success(result.existing ? `Facture ${result.number} déjà créée.` : `Facture ${result.number} créée.`)
        router.push(`/dashboard/factures/${result.id}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Facturation impossible.")
      }
    })
  }

  function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!completionId) return
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        await completeFieldIntervention({ interventionId: completionId, report: value(form, "report"), laborMinutes: Number(value(form, "laborMinutes")), customerName: value(form, "customerName"), customerApproval: form.get("customerApproval") === "on" })
        toast.success("Intervention clôturée et accord client scellé.")
        setCompletionId(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Clôture impossible.")
      }
    })
  }

  function uploadInterventionFile(interventionId: string, input: HTMLInputElement) {
    const file = input.files?.[0]
    if (!file) return
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set("file", file)
        const response = await fetch(`/api/files/intervention/${interventionId}`, { method: "POST", body: formData })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "Ajout impossible")
        toast.success("Pièce d’intervention ajoutée et contrôlée.")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Ajout impossible.")
      } finally {
        input.value = ""
      }
    })
  }

  function deleteInterventionFile(fileId: string) {
    if (!window.confirm("Supprimer définitivement cette pièce d’intervention ?")) return
    startTransition(async () => {
      try {
        const response = await fetch(`/api/files/intervention/${fileId}`, { method: "DELETE" })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "Suppression impossible")
        toast.success("Pièce d’intervention supprimée.")
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Suppression impossible.")
      }
    })
  }

  function submitDeliverySignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!deliverySignId) return
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        await signDeliveryNote({ deliveryNoteId: deliverySignId, recipientName: value(form, "recipientName"), customerApproval: form.get("customerApproval") === "on" })
        toast.success("Bon de livraison signé et scellé.")
        setDeliverySignId(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Signature impossible.")
      }
    })
  }

  function submitInterventionMaterial(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!materialInterventionId) return
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        await consumeInterventionMaterial({ interventionId: materialInterventionId, warehouseId: value(form, "materialWarehouseId"), productId: value(form, "materialProductId"), quantity: Number(value(form, "materialQuantity")) })
        toast.success("Matériel consommé et coût réel mis à jour.")
        setMaterialInterventionId(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Consommation impossible.")
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ icon: Icon, label, metric, detail }) => <Card key={label}><CardContent className="flex items-center gap-4 p-5"><span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span><div><p className="text-2xl font-semibold tabular-nums">{metric}</p><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div></CardContent></Card>)}
      </div>

      <Card>
        <CardHeader className="pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4 text-primary" />Créer une opération</CardTitle><CardDescription>Les rattachements sont contrôlés côté serveur avant chaque écriture.</CardDescription></div><div className="w-full lg:w-64"><Select value={createKind} onValueChange={(next) => setCreateKind(next as CreateKind)}><SelectTrigger aria-label="Type d’opération"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CREATE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div></CardHeader>
        <CardContent><form key={createKind} onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{renderForm(createKind, initialData)}<div className="flex items-end"><Button type="submit" disabled={isPending} className="w-full sm:w-auto">{isPending ? <Loader2 className="animate-spin" /> : <Plus />}Enregistrer</Button></div></form></CardContent>
      </Card>

      <Tabs defaultValue={searchParams.get("tab") === "orders" ? "orders" : searchParams.get("tab") === "stock" ? "stock" : "sav"} className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="sav"><Wrench />SAV</TabsTrigger><TabsTrigger value="planning"><CalendarDays />Planning</TabsTrigger><TabsTrigger value="maintenance"><ClipboardCheck />Entretien</TabsTrigger><TabsTrigger value="orders"><ClipboardList />Commandes</TabsTrigger><TabsTrigger value="stock"><Boxes />Stock & achats</TabsTrigger><TabsTrigger value="assets"><PackageCheck />Sites & parc</TabsTrigger></TabsList>
        <TabsContent value="sav"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Tickets SAV</h2></div>{initialData.tickets.length ? <div className="divide-y">{initialData.tickets.map((ticket) => <div key={ticket.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><code className="text-xs font-semibold">{ticket.number}</code><Badge variant={ticket.priority === "URGENT" ? "destructive" : "outline"}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge><Badge variant={ticket.status === "CLOSED" ? "secondary" : "outline"}>{TICKET_STATUS[ticket.status] ?? ticket.status}</Badge></div><p className="mt-2 text-sm font-semibold">{ticket.title}</p><p className="mt-1 text-xs text-muted-foreground">{ticket.client.name}{ticket.site ? ` · ${ticket.site.label}` : ""}{ticket.equipment ? ` · ${ticket.equipment.label}` : ""} · {ticket._count.interventions} intervention{ticket._count.interventions > 1 ? "s" : ""}</p></div><div className="flex gap-2">{!['RESOLVED','CLOSED'].includes(ticket.status) ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Ticket résolu.", () => updateServiceTicketStatus(ticket.id, "RESOLVED"))}>Résoudre</Button> : null}{ticket.status === "RESOLVED" ? <Button size="sm" disabled={isPending} onClick={() => mutate("Ticket clos.", () => updateServiceTicketStatus(ticket.id, "CLOSED"))}>Clore</Button> : null}</div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun ticket SAV.</p>}</section></TabsContent>
        <TabsContent value="planning">
          <div className="space-y-4">
            <CapacityOverview members={initialData.members} interventions={initialData.interventions} />
            <section className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Planning terrain</h2></div>
            {initialData.interventions.length ? (
              <div className="divide-y">
                {initialData.interventions.map((item) => (
                  <article key={item.id} className="px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.status === "COMPLETED" ? "secondary" : "outline"}>{INTERVENTION_STATUS[item.status] ?? item.status}</Badge>
                          <span className="text-xs font-medium tabular-nums">{formatDate(item.scheduledStart)}</span>
                          {item.files.length ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileImage className="size-3.5" />{item.files.length} pièce{item.files.length > 1 ? "s" : ""}</span> : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold">{item.title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{item.site.client.name} · {item.site.label}{item.ticket ? ` · ${item.ticket.number}` : ""}{item.assignedMembership ? ` · ${item.assignedMembership.user.name || item.assignedMembership.user.email}` : ""}</p>
                        {item.report ? <p className="mt-2 text-xs leading-5 text-muted-foreground">Compte rendu : {item.report}</p> : null}
                        <InterventionCostSummary intervention={item} />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <label className={buttonVariants({ variant: "outline", size: "sm" })}>
                          <Upload />Ajouter une pièce
                          <input
                            type="file"
                            className="sr-only"
                            accept="image/jpeg,image/png,image/webp,application/pdf"
                            capture="environment"
                            aria-label={`Ajouter une pièce à ${item.title}`}
                            disabled={isPending}
                            onChange={(event) => uploadInterventionFile(item.id, event.currentTarget)}
                          />
                        </label>
                        {item.status !== "CANCELED" ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => setMaterialInterventionId(item.id)}><PackageMinus />Matériel utilisé</Button> : null}
                        {item.status === "PLANNED" ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Intervention démarrée.", () => updateInterventionStatus(item.id, "IN_PROGRESS"))}>Démarrer</Button> : null}
                        {item.status === "IN_PROGRESS" ? <Button size="sm" disabled={isPending} onClick={() => setCompletionId(item.id)}>Clôturer</Button> : null}
                        {item.status === "COMPLETED" ? <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/intervention/${item.id}`} target="_blank" rel="noreferrer"><FileText />Rapport PDF</a> : null}
                      </div>
                    </div>
                    {item.files.length ? (
                      <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                        {item.files.map((file) => (
                          <div key={file.id} className="inline-flex min-w-0 items-center gap-1 rounded-lg bg-muted/60 pl-2 text-xs">
                            {file.kind === "PHOTO" ? <FileImage className="size-3.5 shrink-0 text-primary" /> : <FileText className="size-3.5 shrink-0 text-primary" />}
                            <a className="max-w-52 truncate py-2 font-medium hover:underline" href={`/api/files/intervention/${file.id}`} target="_blank" rel="noreferrer">{file.name}</a>
                            <Button type="button" size="icon-xs" variant="ghost" title={`Supprimer ${file.name}`} disabled={isPending} onClick={() => deleteInterventionFile(file.id)}><Trash2 className="text-danger" /></Button>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune intervention planifiée.</p>}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="maintenance"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Contrats d’entretien</h2></div>{initialData.contracts.length ? <div className="divide-y">{initialData.contracts.map((contract) => <div key={contract.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><code className="text-xs font-semibold">{contract.number}</code><Badge variant="outline">{contract.status}</Badge></div><p className="mt-2 text-sm font-semibold">{contract.label}</p><p className="mt-1 text-xs text-muted-foreground">{contract.client.name} · {contract.site.label} · {contract._count.equipments} équipement{contract._count.equipments > 1 ? "s" : ""}</p></div><div className="text-left sm:text-right"><p className="text-sm font-medium tabular-nums">{formatMoney(contract.priceCents)}</p><p className="text-xs text-muted-foreground">Prochaine visite : {contract.nextVisitAt ? formatDate(contract.nextVisitAt) : "à planifier"}</p></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun contrat d’entretien.</p>}</section></TabsContent>
        <TabsContent value="orders"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Commandes client</h2></div>{initialData.customerOrders.length ? <div className="divide-y">{initialData.customerOrders.map((order) => <div key={order.id} className="px-5 py-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-semibold">{order.number}</p><p className="mt-1 text-sm font-medium">{order.client.name}</p><p className="mt-1 text-xs text-muted-foreground">{order.project?.name || "Sans chantier"} · {order.lines.length} ligne{order.lines.length > 1 ? "s" : ""} · {order._count.stockReservations} réservation{order._count.stockReservations > 1 ? "s" : ""}</p><div className="mt-3 flex flex-wrap gap-2">{order.depositCents > 0 && !order.invoices.some((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED") ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "DEPOSIT")}>Facturer l’acompte</Button> : null}{order.billingStatus !== "INVOICED" ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "BALANCE")}>Facturer le solde</Button> : null}</div></div><div className="text-left sm:text-right"><div className="flex flex-wrap gap-2 sm:justify-end"><Badge variant="outline">{order.status}</Badge><Badge variant="secondary">{order.billingStatus}</Badge></div><p className="mt-2 text-xs font-medium tabular-nums">{formatMoney(order.totalTtcCents)} TTC</p></div></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune commande client.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Réservations actives</h2></div>{initialData.reservations.length ? <div className="divide-y">{initialData.reservations.map((reservation) => <div key={reservation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{reservation.product.label}</p><p className="mt-1 text-xs text-muted-foreground">{reservation.quantity} · {reservation.warehouse.name}{reservation.project ? ` · ${reservation.project.name}` : ""}{reservation.customerOrder ? ` · ${reservation.customerOrder.number}` : ""}</p></div><div className="flex gap-2"><Button size="sm" disabled={isPending} onClick={() => mutate("Stock consommé pour le dossier.", () => consumeStockReservation(reservation.id))}>Consommer</Button><Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Réservation libérée.", () => releaseStockReservation(reservation.id))}>Libérer</Button></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune réservation active.</p>}</section></div>{initialData.deliveryNotes.length ? <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Derniers bons de livraison</h2></div><div className="divide-y">{initialData.deliveryNotes.map((note) => <div key={note.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-semibold">{note.number}</p><Badge variant={note.signedAt ? "secondary" : "outline"}>{note.signedAt ? "Signé" : "Livré"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{note.customerOrder.client.name} · {note.lines.reduce((sum, line) => sum + line.quantity, 0)} unité{note.lines.reduce((sum, line) => sum + line.quantity, 0) > 1 ? "s" : ""}{note.recipientName ? ` · ${note.recipientName}` : ""}</p></div><div className="flex flex-wrap gap-2">{!note.signedAt ? <Button size="sm" onClick={() => setDeliverySignId(note.id)} disabled={isPending}><PenLine />Faire signer</Button> : null}<a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/livraison/${note.id}`} target="_blank" rel="noreferrer"><FileText />PDF</a></div></div>)}</div></section> : null}</TabsContent>
        <TabsContent value="stock">
          <div className="space-y-5">
            <PurchaseWorkflow data={initialData} />
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Stock par produit</h2></div>{initialData.products.length ? <div className="divide-y">{initialData.products.map((product) => { const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0); const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0); return <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-medium">{product.label}</p><p className="font-mono text-[11px] text-muted-foreground">{product.sku}{product.supplier ? ` · ${product.supplier.name}` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{quantity - reserved} disponible{quantity - reserved > 1 ? "s" : ""}</p><p className="text-xs text-muted-foreground">{reserved} réservé{reserved > 1 ? "s" : ""}</p></div></div>})}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Catalogue produit vide.</p>}</section>
              <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Réceptions récentes</h2></div>{initialData.goodsReceipts.length ? <div className="divide-y">{initialData.goodsReceipts.map((receipt) => <div key={receipt.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="font-mono text-xs font-semibold">{receipt.number}</p><p className="mt-1 text-xs text-muted-foreground">{receipt.purchaseOrder.supplier.name} · {receipt.warehouse.name} · {receipt.lines.reduce((sum, line) => sum + line.acceptedQuantity, 0)} acceptée{receipt.lines.some((line) => line.rejectedQuantity) ? ` · ${receipt.lines.reduce((sum, line) => sum + line.rejectedQuantity, 0)} rejetée` : ""}</p></div><p className="text-xs tabular-nums text-muted-foreground">{formatDate(receipt.receivedAt)}</p></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune réception.</p>}</section>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="assets"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Sites clients</h2></div>{initialData.sites.length ? <div className="divide-y">{initialData.sites.map((site) => <div key={site.id} className="flex items-center gap-3 px-5 py-3"><MapPin className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{site.client.name} · {site.label}</p><p className="truncate text-xs text-muted-foreground">{site.address1}{site.city ? `, ${site.postalCode || ""} ${site.city}` : ""}</p></div><span className="text-xs tabular-nums text-muted-foreground">{site._count.equipments} équip.</span></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun site.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Parc installé</h2></div>{initialData.equipments.length ? <div className="divide-y">{initialData.equipments.map((equipment) => <div key={equipment.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{equipment.label}</p><Badge variant="outline">{equipment.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{equipment.site.client.name} · {equipment.site.label}{equipment.serialNumber ? ` · S/N ${equipment.serialNumber}` : ""}</p></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun équipement installé.</p>}</section></div></TabsContent>
      </Tabs>
      <Dialog open={Boolean(completionId)} onOpenChange={(open) => { if (!open) setCompletionId(null) }}><DialogContent><form onSubmit={submitCompletion} className="space-y-4"><DialogHeader><DialogTitle>Clôturer l’intervention</DialogTitle></DialogHeader><Field label="Compte rendu terrain" name="report" required><textarea id="report" name="report" required className="min-h-32 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Travaux réalisés, contrôles et éventuelles réserves…" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Temps passé (minutes)" name="laborMinutes" required><Input id="laborMinutes" name="laborMinutes" type="number" min="0" defaultValue="60" required /></Field><Field label="Nom du client présent" name="customerName" required><Input id="customerName" name="customerName" required /></Field></div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input name="customerApproval" type="checkbox" required className="mt-0.5 size-4" /><span>Le client confirme le compte rendu et la fin de l’intervention. Une empreinte horodatée sera conservée dans le journal d’audit.</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => setCompletionId(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : null}Valider la clôture</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(materialInterventionId)} onOpenChange={(open) => { if (!open) setMaterialInterventionId(null) }}><DialogContent><form onSubmit={submitInterventionMaterial} className="space-y-4"><DialogHeader><DialogTitle>Matériel utilisé en intervention</DialogTitle></DialogHeader><Field label="Dépôt" name="materialWarehouseId" required><NativeSelect name="materialWarehouseId" required>{initialData.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="materialProductId" required><NativeSelect name="materialProductId" required>{initialData.products.filter((product) => product.stockTracked).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}</NativeSelect></Field><Field label="Quantité consommée" name="materialQuantity" required><Input id="materialQuantity" name="materialQuantity" type="number" min="1" step="1" defaultValue="1" required /></Field><p className="text-xs leading-5 text-muted-foreground">La quantité est sortie du dépôt dans une transaction unique. Le coût d’achat du catalogue est figé sur le mouvement pour conserver l’historique.</p><DialogFooter><Button type="button" variant="outline" onClick={() => setMaterialInterventionId(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : <PackageMinus />}Consommer</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(deliverySignId)} onOpenChange={(open) => { if (!open) setDeliverySignId(null) }}><DialogContent><form onSubmit={submitDeliverySignature} className="space-y-4"><DialogHeader><DialogTitle>Signer le bon de livraison</DialogTitle></DialogHeader><Field label="Nom du réceptionnaire" name="deliverySignatureRecipientName" required><Input id="deliverySignatureRecipientName" name="recipientName" required /></Field><label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm"><input name="customerApproval" type="checkbox" required className="mt-0.5 size-4" /><span>Le réceptionnaire confirme les quantités indiquées et la réception. Le bon sera horodaté et scellé par empreinte SHA-256.</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => setDeliverySignId(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : <PenLine />}Signer et sceller</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  )
}

function InterventionCostSummary({ intervention }: { intervention: OperationsData["interventions"][number] }) {
  const materialCost = intervention.stockMovements.reduce((sum, movement) => sum + Math.abs(movement.quantity) * (movement.unitCostCents ?? 0), 0)
  const hourlyCost = intervention.assignedMembership?.hourlyCostCents ?? 0
  const laborCost = Math.round(intervention.laborMinutes * hourlyCost / 60)
  if (!intervention.stockMovements.length && !laborCost) return null
  return (
    <div className="mt-3 rounded-lg border bg-muted/35 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Coût réel interne</span><span className="font-semibold tabular-nums">{formatMoney(materialCost + laborCost)}</span></div>
      <p className="mt-1 text-muted-foreground">Matériel {formatMoney(materialCost)} · Main-d’œuvre {formatMoney(laborCost)}</p>
      {intervention.stockMovements.length ? <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">{intervention.stockMovements.map((movement) => <li key={movement.id}>{Math.abs(movement.quantity)} × {movement.product.label} · {movement.warehouse.name}</li>)}</ul> : null}
    </div>
  )
}

function CapacityOverview({ members, interventions }: { members: OperationsData["members"]; interventions: OperationsData["interventions"] }) {
  const now = new Date()
  const weekStart = new Date(now)
  const day = weekStart.getDay()
  weekStart.setDate(weekStart.getDate() - (day === 0 ? 6 : day - 1))
  weekStart.setHours(0, 0, 0, 0)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekly = interventions.filter((item) => {
    const start = new Date(item.scheduledStart)
    return start >= weekStart && start < weekEnd && item.status !== "CANCELED"
  })
  const rows = members.filter((member) => ["OWNER", "ADMIN", "OPERATIONS", "TECHNICIAN", "SERVICE"].includes(member.role)).map((member) => {
    const assigned = weekly.filter((item) => item.assignedMembershipId === member.id)
    const plannedMinutes = assigned.reduce((sum, item) => {
      if (!item.scheduledEnd) return sum + 60
      return sum + Math.max(15, Math.round((new Date(item.scheduledEnd).getTime() - new Date(item.scheduledStart).getTime()) / 60_000))
    }, 0)
    const capacity = Math.max(member.weeklyCapacityMinutes, 60)
    return { id: member.id, name: member.user.name || member.user.email || "Membre", plannedMinutes, capacity, interventions: assigned.length, utilization: Math.round(plannedMinutes / capacity * 100) }
  }).sort((left, right) => right.utilization - left.utilization)
  const unassigned = weekly.filter((item) => !item.assignedMembershipId).length
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Capacité de la semaine</h2><p className="mt-1 text-xs text-muted-foreground">Charge planifiée du lundi au dimanche ; une intervention sans heure de fin compte pour 1 h.</p></div>{unassigned ? <Badge variant="outline">{unassigned} non affectée{unassigned > 1 ? "s" : ""}</Badge> : null}</div>
      {rows.length ? <div className="divide-y">{rows.map((row) => <div key={row.id} className="grid gap-3 px-5 py-3 sm:grid-cols-[minmax(160px,0.7fr)_minmax(220px,1fr)_150px] sm:items-center"><div><p className="truncate text-sm font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.interventions} intervention{row.interventions > 1 ? "s" : ""}</p></div><div className="h-2 overflow-hidden rounded-full bg-muted" aria-label={`${row.utilization} % de capacité utilisée`}><div className={`h-full rounded-full ${row.utilization > 100 ? "bg-danger" : row.utilization >= 80 ? "bg-warning" : "bg-primary"}`} style={{ width: `${Math.min(row.utilization, 100)}%` }} /></div><p className={`text-sm font-semibold tabular-nums sm:text-right ${row.utilization > 100 ? "text-danger" : ""}`}>{Math.round(row.plannedMinutes / 6) / 10} h / {Math.round(row.capacity / 6) / 10} h</p></div>)}</div> : <p className="px-5 py-8 text-sm text-muted-foreground">Aucun membre actif.</p>}
    </section>
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
  if (kind === "MAINTENANCE") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Libellé du contrat" name="label" required><Input id="label" name="label" required placeholder="Entretien annuel couverture" /></Field><Field label="Équipement couvert" name="equipmentId"><NativeSelect name="equipmentId">{data.equipments.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.site.client.name} · {equipment.label}</option>)}</NativeSelect></Field><Field label="Début" name="startDate" required><Input id="startDate" name="startDate" type="date" required /></Field><Field label="Fin" name="endDate"><Input id="endDate" name="endDate" type="date" /></Field><Field label="Fréquence" name="frequency"><NativeSelect name="frequency"><option value="ANNUAL">Annuelle</option><option value="BIANNUAL">Semestrielle</option><option value="QUARTERLY">Trimestrielle</option><option value="MONTHLY">Mensuelle</option></NativeSelect></Field><Field label="Prochaine visite" name="nextVisitAt"><Input id="nextVisitAt" name="nextVisitAt" type="date" /></Field><Field label="Prix HT (€)" name="price"><Input id="price" name="price" inputMode="decimal" /></Field><Field label="TVA (%)" name="tvaRate"><Input id="tvaRate" name="tvaRate" type="number" min="0" max="100" step="0.1" defaultValue="20" /></Field><Field label="Échéance facture (jours)" name="invoiceDueDays"><Input id="invoiceDueDays" name="invoiceDueDays" type="number" min="0" max="365" defaultValue="30" /></Field><Field label="Notes" name="notes"><Input id="notes" name="notes" /></Field><label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm sm:col-span-2"><input name="autoInvoice" type="checkbox" className="mt-0.5 size-4" /><span><strong className="block">Facturation automatique</strong><span className="mt-1 block text-xs text-muted-foreground">Crée un modèle récurrent aligné sur la fréquence du contrat.</span></span></label></>
  if (kind === "STOCK") return <><Field label="Dépôt" name="warehouseId" required><NativeSelect name="warehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="productId" required><NativeSelect name="productId" required>{products}</NativeSelect></Field><Field label="Mouvement" name="type" required><NativeSelect name="type" required><option value="IN">Entrée</option><option value="OUT">Sortie</option><option value="RESERVE">Réserver chantier</option><option value="RELEASE">Libérer réservation</option><option value="CONSUME">Consommer</option><option value="ADJUST">Ajustement signé</option></NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" required defaultValue="1" /></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Référence" name="reference"><Input id="reference" name="reference" /></Field></>
  if (kind === "CUSTOMER_ORDER") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Produit" name="productId"><NativeSelect name="productId">{products}</NativeSelect></Field><Field label="Libellé" name="label" required><Input id="label" name="label" required /></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></Field><Field label="Prix unitaire HT (€)" name="unitPrice" required><Input id="unitPrice" name="unitPrice" inputMode="decimal" required /></Field><Field label="TVA (%)" name="tvaRate"><Input id="tvaRate" name="tvaRate" type="number" min="0" max="100" step="0.1" defaultValue="20" /></Field><Field label="Acompte (€)" name="deposit"><Input id="deposit" name="deposit" inputMode="decimal" /></Field><Field label="Pose prévue" name="expectedInstallationAt"><Input id="expectedInstallationAt" name="expectedInstallationAt" type="date" /></Field></>
  if (kind === "RESERVATION") return <><Field label="Dépôt" name="warehouseId" required><NativeSelect name="warehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="productId" required><NativeSelect name="productId" required>{products}</NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required /></Field><Field label="Commande client" name="customerOrderId"><NativeSelect name="customerOrderId">{data.customerOrders.filter((order) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.client.name}</option>)}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field></>
  if (kind === "DELIVERY") return <><Field label="Commande client" name="customerOrderId" required><NativeSelect name="customerOrderId" required>{data.customerOrders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.client.name}</option>)}</NativeSelect></Field><Field label="Ligne livrée" name="customerOrderLineId" required><NativeSelect name="customerOrderLineId" required>{data.customerOrders.flatMap((order) => order.lines.filter((line) => line.deliveredQuantity < line.quantity).map((line) => <option key={line.id} value={line.id}>{order.number} · {line.label} · reste {line.quantity - line.deliveredQuantity}</option>))}</NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></Field><Field label="Réceptionnaire" name="recipientName"><Input id="recipientName" name="recipientName" /></Field></>
  return null
}
