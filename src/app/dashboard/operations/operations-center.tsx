"use client"

import { useEffect, useMemo, useState, useTransition, type FormEvent, type ReactNode } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { AlertTriangle, ArrowRightLeft, Boxes, Building2, CalendarClock, CalendarDays, CheckCircle2, ClipboardCheck, ClipboardList, FileImage, FileText, Loader2, MapPin, Navigation, PackageCheck, PackageMinus, PenLine, Plus, ShieldCheck, Trash2, Upload, Wrench, type LucideIcon } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { uploadResourceFile } from "@/lib/client-file-upload"

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
  createStockTransfer,
  createSupplier,
  createWarehouse,
  consumeStockReservation,
  consumeInterventionMaterial,
  releaseStockReservation,
  rescheduleFieldIntervention,
  resolveInterventionReservation,
  reserveStock,
  signDeliveryNote,
  updateInterventionStatus,
} from "@/actions/operations"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { planningEnd, planningSlotsOverlap, routeDistanceKm } from "@/lib/operations/planning"
import { PurchaseWorkflow } from "./purchase-workflow"
import { MaintenanceRenewalPanel } from "./_components/maintenance-renewal-panel"

const SignatureCanvas = dynamic(() => import("@/components/shared/signature-canvas").then((module) => module.SignatureCanvas), { ssr: false })

type OperationsData = Awaited<ReturnType<typeof import("@/actions/operations").getOperationsDashboard>>
type CreateKind = "TICKET" | "INTERVENTION" | "MAINTENANCE" | "SITE" | "EQUIPMENT" | "PRODUCT" | "SUPPLIER" | "WAREHOUSE" | "STOCK" | "TRANSFER" | "CUSTOMER_ORDER" | "RESERVATION" | "DELIVERY"

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
  TRANSFER: "Transfert de stock",
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

function filterOperationsByAgency(data: OperationsData, agencyId: string): OperationsData {
  if (agencyId === "ALL") return data
  const warehouseIds = new Set(data.warehouses.filter((warehouse) => warehouse.agencyId === agencyId).map((warehouse) => warehouse.id))
  return {
    ...data,
    sites: data.sites.filter((site) => site.agencyId === agencyId),
    products: data.products.map((product) => ({
      ...product,
      inventoryItems: product.inventoryItems.filter((item) => warehouseIds.has(item.warehouseId)),
    })),
    warehouses: data.warehouses.filter((warehouse) => warehouse.agencyId === agencyId),
    purchaseOrders: data.purchaseOrders.filter((order) => order.project?.agencyId === agencyId),
    equipments: data.equipments.filter((equipment) => equipment.site.agencyId === agencyId),
    tickets: data.tickets.filter((ticket) => ticket.site?.agencyId === agencyId),
    interventions: data.interventions.filter((intervention) => intervention.site.agencyId === agencyId),
    contracts: data.contracts.filter((contract) => contract.site.agencyId === agencyId),
    projects: data.projects.filter((project) => project.agencyId === agencyId),
    members: data.members.filter((member) => member.agencyMemberships.some((membership) => membership.agencyId === agencyId)),
    customerOrders: data.customerOrders.filter((order) => order.project?.agencyId === agencyId),
    goodsReceipts: data.goodsReceipts.filter((receipt) => receipt.warehouse.agencyId === agencyId),
    reservations: data.reservations.filter((reservation) => reservation.warehouse.agencyId === agencyId),
    deliveryNotes: data.deliveryNotes.filter((note) => note.customerOrder.project?.agencyId === agencyId),
    stockTransfers: data.stockTransfers.filter((transfer) => transfer.fromWarehouse.agencyId === agencyId || transfer.toWarehouse.agencyId === agencyId),
  }
}

export function OperationsCenter({ initialData: serverData }: { initialData: OperationsData }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [sourceData, setSourceData] = useState(serverData)
  const [createKind, setCreateKind] = useState<CreateKind>("TICKET")
  const [completionId, setCompletionId] = useState<string | null>(null)
  const [completionSignatureData, setCompletionSignatureData] = useState("")
  const [deliverySignId, setDeliverySignId] = useState<string | null>(null)
  const [materialInterventionId, setMaterialInterventionId] = useState<string | null>(null)
  const [planningInterventionId, setPlanningInterventionId] = useState<string | null>(null)
  const [agencyId, setAgencyId] = useState("ALL")
  const [createOpen, setCreateOpen] = useState(searchParams.get("create") === "1")
  useEffect(() => setSourceData(serverData), [serverData])
  const data = useMemo(() => filterOperationsByAgency(sourceData, agencyId), [sourceData, agencyId])
  const initialData = data

  const openTickets = data.tickets.filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status)).length
  const comingInterventions = data.interventions.filter((item) => new Date(item.scheduledStart) >= new Date() && !["COMPLETED", "CANCELED"].includes(item.status)).length
  const lowStock = data.products.filter((product) => {
    if (agencyId !== "ALL" && product.inventoryItems.length === 0) return false
    const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0)
    const reorder = product.inventoryItems.reduce((sum, item) => sum + item.reorderPoint, 0)
    return product.stockTracked && quantity - reserved <= reorder
  }).length
  const activeOrders = data.purchaseOrders.filter((order) => !["RECEIVED", "CANCELED"].includes(order.status)).length
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
        if (createKind === "SITE") await createCustomerSite({ clientId: value(form, "clientId"), agencyId: optional(form, "agencyId"), label: value(form, "label"), kind: value(form, "kind") || "INSTALLATION", address1: value(form, "address1"), postalCode: optional(form, "postalCode"), city: optional(form, "city"), latitude: optional(form, "latitude"), longitude: optional(form, "longitude"), accessNotes: optional(form, "notes") })
        else if (createKind === "SUPPLIER") await createSupplier({ name: value(form, "name"), code: optional(form, "code"), contactName: optional(form, "contactName"), email: optional(form, "email"), phone: optional(form, "phone"), deliveryDays: optional(form, "deliveryDays") })
        else if (createKind === "PRODUCT") await createProduct({ sku: value(form, "sku"), label: value(form, "label"), supplierId: optional(form, "supplierId"), manufacturer: optional(form, "manufacturer"), family: optional(form, "family"), unit: value(form, "unit") || "unité", purchasePriceCents: cents(form, "purchasePrice"), salePriceCents: cents(form, "salePrice"), stockTracked: true })
        else if (createKind === "WAREHOUSE") await createWarehouse({ agencyId: optional(form, "agencyId"), name: value(form, "name"), code: value(form, "code"), address: optional(form, "address") })
        else if (createKind === "EQUIPMENT") await createEquipment({ siteId: value(form, "siteId"), productId: optional(form, "productId"), label: value(form, "label"), category: optional(form, "category"), manufacturer: optional(form, "manufacturer"), model: optional(form, "model"), serialNumber: optional(form, "serialNumber"), installedAt: isoDate(form, "installedAt"), warrantyUntil: isoDate(form, "warrantyUntil"), notes: optional(form, "notes") })
        else if (createKind === "TICKET") await createServiceTicket({ clientId: value(form, "clientId"), siteId: optional(form, "siteId"), equipmentId: optional(form, "equipmentId"), assignedMembershipId: optional(form, "assignedMembershipId"), title: value(form, "title"), description: value(form, "description"), type: value(form, "type") || "SAV", priority: value(form, "priority") || "NORMAL", dueAt: isoDate(form, "dueAt"), requiredSkill: optional(form, "requiredSkill"), territory: optional(form, "territory") })
        else if (createKind === "INTERVENTION") {
          const result = await createFieldIntervention({ ticketId: optional(form, "ticketId"), projectId: optional(form, "projectId"), siteId: value(form, "siteId"), assignedMembershipId: optional(form, "assignedMembershipId"), title: value(form, "title"), type: value(form, "type") || "SAV", scheduledStart: isoDate(form, "scheduledStart"), scheduledEnd: isoDate(form, "scheduledEnd") })
          if (!result.success) throw new Error(result.error)
        }
        else if (createKind === "MAINTENANCE") {
          const result = await createMaintenanceContract({ clientId: value(form, "clientId"), siteId: value(form, "siteId"), label: value(form, "label"), startDate: value(form, "startDate"), endDate: optional(form, "endDate"), frequency: value(form, "frequency") || "ANNUAL", nextVisitAt: optional(form, "nextVisitAt"), priceCents: cents(form, "price"), autoInvoice: form.get("autoInvoice") === "on", tvaRate: Number(value(form, "tvaRate") || "20"), invoiceDueDays: Number(value(form, "invoiceDueDays") || "30"), equipmentIds: optional(form, "equipmentId") ? [value(form, "equipmentId")] : [], notes: optional(form, "notes") })
          setSourceData((current) => ({
            ...current,
            contracts: [result.contract, ...current.contracts.filter((item) => item.id !== result.contract.id)],
          }))
        }
        else if (createKind === "STOCK") await createStockMovement({ warehouseId: value(form, "warehouseId"), productId: value(form, "productId"), projectId: optional(form, "projectId"), type: value(form, "type"), quantity: Number(value(form, "quantity")), unitCostCents: cents(form, "unitCost"), reference: optional(form, "reference"), notes: optional(form, "notes") })
        else if (createKind === "TRANSFER") await createStockTransfer({ fromWarehouseId: value(form, "fromWarehouseId"), toWarehouseId: value(form, "toWarehouseId"), productId: value(form, "productId"), quantity: Number(value(form, "quantity")), reference: optional(form, "reference"), notes: optional(form, "notes") })
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

  function openComposer(kind: CreateKind) {
    setCreateKind(kind)
    setCreateOpen(true)
    window.requestAnimationFrame(() => document.getElementById("operations-composer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }))
  }

  function submitCompletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!completionId) return
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        if (!completionSignatureData) throw new Error("La signature manuscrite du client est requise")
        const response = await fetch(`/api/field/interventions/${completionId}/complete`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: value(form, "report"), laborMinutes: Number(value(form, "laborMinutes")), customerName: value(form, "customerName"), customerApproval: form.get("customerApproval") === "on", customerSignatureData: completionSignatureData, materials: [], expenses: [], reservations: [] }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result?.error || "Clôture impossible")
        toast.success("Intervention clôturée et accord client scellé.")
        setCompletionId(null)
        setCompletionSignatureData("")
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
        await uploadResourceFile("intervention", interventionId, file)
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

  function submitInterventionPlanning(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!planningInterventionId) return
    const form = new FormData(event.currentTarget)
    startTransition(async () => {
      try {
        const result = await rescheduleFieldIntervention({
          interventionId: planningInterventionId,
          assignedMembershipId: optional(form, "planningAssignedMembershipId"),
          scheduledStart: isoDate(form, "planningScheduledStart"),
          scheduledEnd: isoDate(form, "planningScheduledEnd"),
        })
        if (!result.success) throw new Error(result.error)
        toast.success("Intervention replanifiée.")
        setPlanningInterventionId(null)
        router.refresh()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Replanification impossible.")
      }
    })
  }

  return (
    <div className="workspace-page">
      <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-end">
          <p className="text-[13px] font-medium text-muted-foreground">Périmètre opérationnel</p>
          <div className="w-full sm:w-72">
            <Select value={agencyId} onValueChange={(next) => setAgencyId(next || "ALL")}>
              <SelectTrigger aria-label="Filtrer par agence"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="ALL">Toutes les agences</SelectItem>{sourceData.agencies.map((agency) => <SelectItem key={agency.id} value={agency.id}>{agency.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
      </div>

      <div className="workspace-metrics grid gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
        {stats.map(({ icon: Icon, label, metric, detail }, index) => <Card key={label} className="workspace-metric min-h-[116px]"><CardContent className="flex h-full items-start justify-between gap-3 p-4"><div className="min-w-0 flex-1"><p className="line-clamp-2 text-[13px] font-medium leading-4 text-foreground/85">{label}</p><p className="mt-2 text-[25px] font-semibold leading-none tracking-[-0.02em] tabular-nums">{metric}</p><div className="mt-4 flex min-w-0 items-start gap-2 border-t pt-2.5"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${metric > 0 && index >= 2 ? "bg-warning" : "bg-success"}`} /><p className="line-clamp-2 text-xs leading-4 text-muted-foreground">{detail}</p></div></div><span className={`grid size-9 shrink-0 place-items-center rounded-lg ${index === 1 ? "bg-teal-50 text-teal-600" : index >= 2 ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}><Icon className="size-4" /></span></CardContent></Card>)}
      </div>

      <details id="operations-composer" data-testid="operation-composer" open={createOpen} onToggle={(event) => setCreateOpen(event.currentTarget.open)} className="group scroll-mt-20 rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]">
        <summary className="details-summary flex min-h-12 cursor-pointer list-none items-center gap-2 px-4.5 text-sm font-semibold transition-colors hover:bg-muted/35"><Plus className="size-4 text-primary" />Créer ou enregistrer une opération<span className="ml-auto text-xs font-normal text-muted-foreground">Ticket, intervention, achat, stock…</span></summary>
      <Card className="rounded-none border-x-0 border-b-0 shadow-none">
        <CardHeader className="pb-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4 text-primary" />Créer une opération</CardTitle><CardDescription>Les rattachements sont contrôlés côté serveur avant chaque écriture.</CardDescription></div><div className="w-full lg:w-64"><Select value={createKind} onValueChange={(next) => setCreateKind(next as CreateKind)}><SelectTrigger aria-label="Type d’opération"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CREATE_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div></div></CardHeader>
        <CardContent><form key={createKind} onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{renderForm(createKind, sourceData)}<div className="flex items-end"><Button type="submit" disabled={isPending} className="w-full sm:w-auto">{isPending ? <Loader2 className="animate-spin" /> : <Plus />}Enregistrer</Button></div></form></CardContent>
      </Card>
      </details>

      <Tabs defaultValue={(["overview", "sav", "planning", "maintenance", "orders", "stock", "assets"].includes(searchParams.get("tab") || "") ? searchParams.get("tab") : "overview") ?? "overview"} className="space-y-4">
        <TabsList className="max-w-full overflow-x-auto"><TabsTrigger value="overview"><Building2 />Vue opérations</TabsTrigger><TabsTrigger value="sav"><Wrench />SAV</TabsTrigger><TabsTrigger value="planning"><CalendarDays />Planning</TabsTrigger><TabsTrigger value="maintenance"><ClipboardCheck />Entretien</TabsTrigger><TabsTrigger value="orders"><ClipboardList />Commandes</TabsTrigger><TabsTrigger value="stock"><Boxes />Stock & achats</TabsTrigger><TabsTrigger value="assets"><PackageCheck />Sites & parc</TabsTrigger></TabsList>
        <TabsContent value="overview"><div className="space-y-4"><OperationsOverview data={initialData} onCreate={openComposer} /><AgencyComparison data={sourceData} selectedAgencyId={agencyId} /></div></TabsContent>
        <TabsContent value="sav"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Tickets SAV</h2></div>{initialData.tickets.length ? <div className="divide-y">{initialData.tickets.map((ticket) => <div key={ticket.id} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><code className="text-xs font-semibold">{ticket.number}</code><Badge variant={ticket.priority === "URGENT" ? "destructive" : "outline"}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge><Badge variant={ticket.status === "CLOSED" ? "secondary" : "outline"}>{TICKET_STATUS[ticket.status] ?? ticket.status}</Badge></div><Link href={`/dashboard/service/tickets/${ticket.id}`} className="mt-2 block text-sm font-semibold hover:text-primary hover:underline">{ticket.title}</Link><p className="mt-1 text-xs text-muted-foreground">{ticket.client.name}{ticket.site ? ` · ${ticket.site.label}` : ""}{ticket.equipment ? ` · ${ticket.equipment.label}` : ""} · {ticket._count.interventions} intervention{ticket._count.interventions > 1 ? "s" : ""}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/service/tickets/${ticket.id}`} />}>Traiter le dossier</Button></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun ticket SAV.</p>}</section></TabsContent>
        <TabsContent value="planning">
          <div className="space-y-4">
            <CapacityOverview members={initialData.members} interventions={initialData.interventions} />
            <RouteOverview interventions={initialData.interventions} />
            <section className="overflow-hidden rounded-xl border bg-card">
            <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Planning terrain</h2></div>
            {initialData.interventions.length ? (
              <div className="divide-y">
                {initialData.interventions.map((item) => (
                  <article key={item.id} data-field-intervention={item.id} className="px-5 py-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={item.status === "COMPLETED" ? "secondary" : "outline"}>{INTERVENTION_STATUS[item.status] ?? item.status}</Badge>
                          <span className="text-xs font-medium tabular-nums">{formatDate(item.scheduledStart)}</span>
                          {item.files.length ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileImage className="size-3.5" />{item.files.length} pièce{item.files.length > 1 ? "s" : ""}</span> : null}
                        </div>
                        <Link href={`/dashboard/service/interventions/${item.id}`} className="mt-2 block text-sm font-semibold hover:text-primary hover:underline">{item.title}</Link>
                        <p className="mt-1 text-xs text-muted-foreground">{item.site.client.name} · {item.site.label}{item.ticket ? ` · ${item.ticket.number}` : ""}{item.assignedMembership ? ` · ${item.assignedMembership.user.name || item.assignedMembership.user.email}` : ""}</p>
                        {item.report ? <p className="mt-2 text-xs leading-5 text-muted-foreground">Compte rendu : {item.report}</p> : null}
                        <InterventionCostSummary intervention={item} />
                        {item.reservations.length ? <div className="mt-3 rounded-lg border border-warning/25 bg-warning/5 p-3"><p className="text-xs font-semibold">Réserves et reprises</p><div className="mt-2 space-y-2">{item.reservations.map((reservation) => <div key={reservation.id} className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{reservation.title}</span><Badge variant={reservation.status === "RESOLVED" ? "secondary" : reservation.severity === "BLOCKING" ? "destructive" : "outline"}>{reservation.status === "RESOLVED" ? "Résolue" : reservation.severity === "BLOCKING" ? "Bloquante" : reservation.severity === "MAJOR" ? "Majeure" : "Mineure"}</Badge></div>{reservation.details ? <p className="mt-1 text-muted-foreground">{reservation.details}</p> : null}</div>{reservation.status !== "RESOLVED" ? <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Réserve résolue.", () => resolveInterventionReservation(reservation.id))}>Marquer résolue</Button> : null}</div>)}</div></div> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/dashboard/service/interventions/${item.id}`} />}>Dossier</Button>
                        {!['COMPLETED', 'CANCELED'].includes(item.status) ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => setPlanningInterventionId(item.id)}><CalendarClock />Replanifier</Button> : null}
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
                        {item.status === "IN_PROGRESS" ? <Button size="sm" disabled={isPending} onClick={() => { setCompletionSignatureData(""); setCompletionId(item.id) }}>Clôturer</Button> : null}
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
        <TabsContent value="maintenance"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Contrats d’entretien</h2><p className="mt-1 text-xs text-muted-foreground">Visites, facturation, préavis, décisions et continuité des termes.</p></div>{initialData.contracts.length ? <div className="divide-y">{initialData.contracts.map((contract) => <MaintenanceRenewalPanel key={contract.id} contract={contract} />)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun contrat d’entretien.</p>}</section></TabsContent>
        <TabsContent value="orders"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Commandes client</h2></div>{initialData.customerOrders.length ? <div className="divide-y">{initialData.customerOrders.map((order) => <div key={order.id} className="px-5 py-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="font-mono text-xs font-semibold">{order.number}</p><p className="mt-1 text-sm font-medium">{order.client.name}</p><p className="mt-1 text-xs text-muted-foreground">{order.project?.name || "Sans chantier"} · {order.lines.length} ligne{order.lines.length > 1 ? "s" : ""} · {order._count.stockReservations} réservation{order._count.stockReservations > 1 ? "s" : ""}</p><div className="mt-3 flex flex-wrap gap-2">{order.depositCents > 0 && !order.invoices.some((invoice) => invoice.type === "DEPOSIT" && invoice.status !== "CANCELLED") ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "DEPOSIT")}>Facturer l’acompte</Button> : null}{order.billingStatus !== "INVOICED" ? <Button size="sm" variant="outline" disabled={isPending} onClick={() => invoiceOrder(order.id, "BALANCE")}>Facturer le solde</Button> : null}</div></div><div className="text-left sm:text-right"><div className="flex flex-wrap gap-2 sm:justify-end"><Badge variant="outline">{order.status}</Badge><Badge variant="secondary">{order.billingStatus}</Badge></div><p className="mt-2 text-xs font-medium tabular-nums">{formatMoney(order.totalTtcCents)} TTC</p></div></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune commande client.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Réservations actives</h2></div>{initialData.reservations.length ? <div className="divide-y">{initialData.reservations.map((reservation) => <div key={reservation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-sm font-medium">{reservation.product.label}</p><p className="mt-1 text-xs text-muted-foreground">{reservation.quantity} · {reservation.warehouse.name}{reservation.project ? ` · ${reservation.project.name}` : ""}{reservation.customerOrder ? ` · ${reservation.customerOrder.number}` : ""}</p></div><div className="flex gap-2"><Button size="sm" disabled={isPending} onClick={() => mutate("Stock consommé pour le dossier.", () => consumeStockReservation(reservation.id))}>Consommer</Button><Button size="sm" variant="outline" disabled={isPending} onClick={() => mutate("Réservation libérée.", () => releaseStockReservation(reservation.id))}>Libérer</Button></div></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune réservation active.</p>}</section></div>{initialData.deliveryNotes.length ? <section className="mt-6 overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Derniers bons de livraison</h2></div><div className="divide-y">{initialData.deliveryNotes.map((note) => <div key={note.id} className="flex flex-col gap-3 px-5 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-semibold">{note.number}</p><Badge variant={note.signedAt ? "secondary" : "outline"}>{note.signedAt ? "Signé" : "Livré"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{note.customerOrder.client.name} · {note.lines.reduce((sum, line) => sum + line.quantity, 0)} unité{note.lines.reduce((sum, line) => sum + line.quantity, 0) > 1 ? "s" : ""}{note.recipientName ? ` · ${note.recipientName}` : ""}</p></div><div className="flex flex-wrap gap-2">{!note.signedAt ? <Button size="sm" onClick={() => setDeliverySignId(note.id)} disabled={isPending}><PenLine />Faire signer</Button> : null}<a className={buttonVariants({ variant: "outline", size: "sm" })} href={`/api/pdf/livraison/${note.id}`} target="_blank" rel="noreferrer"><FileText />PDF</a></div></div>)}</div></section> : null}</TabsContent>
        <TabsContent value="stock">
          <div className="space-y-5">
            <PurchaseWorkflow data={initialData} />
            <div className="grid gap-5 xl:grid-cols-2">
              <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Stock par produit</h2></div>{initialData.products.length ? <div className="divide-y">{initialData.products.map((product) => { const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0); const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0); return <div key={product.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="text-sm font-medium">{product.label}</p><p className="font-mono text-[11px] text-muted-foreground">{product.sku}{product.supplier ? ` · ${product.supplier.name}` : ""}</p></div><div className="text-right"><p className="text-sm font-semibold tabular-nums">{quantity - reserved} disponible{quantity - reserved > 1 ? "s" : ""}</p><p className="text-xs text-muted-foreground">{reserved} réservé{reserved > 1 ? "s" : ""}</p></div></div>})}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Catalogue produit vide.</p>}</section>
              <section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Réceptions récentes</h2></div>{initialData.goodsReceipts.length ? <div className="divide-y">{initialData.goodsReceipts.map((receipt) => <div key={receipt.id} className="flex items-center justify-between gap-4 px-5 py-3"><div><p className="font-mono text-xs font-semibold">{receipt.number}</p><p className="mt-1 text-xs text-muted-foreground">{receipt.purchaseOrder.supplier.name} · {receipt.warehouse.name} · {receipt.lines.reduce((sum, line) => sum + line.acceptedQuantity, 0)} acceptée{receipt.lines.some((line) => line.rejectedQuantity) ? ` · ${receipt.lines.reduce((sum, line) => sum + line.rejectedQuantity, 0)} rejetée` : ""}</p></div><p className="text-xs tabular-nums text-muted-foreground">{formatDate(receipt.receivedAt)}</p></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucune réception.</p>}</section>
            </div>
            <section className="overflow-hidden rounded-xl border bg-card">
              <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold">Transferts récents</h2><p className="mt-1 text-xs text-muted-foreground">Chaque transfert regroupe une sortie et une entrée indissociables.</p></div><Badge variant="outline"><ArrowRightLeft />{initialData.stockTransfers.length}</Badge></div>
              {initialData.stockTransfers.length ? <div className="divide-y">{initialData.stockTransfers.map((transfer) => <div key={transfer.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium">{transfer.product.label}</p><Badge variant="secondary">{transfer.quantity} unité{transfer.quantity > 1 ? "s" : ""}</Badge></div><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><span>{transfer.fromWarehouse.name}</span><ArrowRightLeft className="size-3.5" /><span>{transfer.toWarehouse.name}</span>{transfer.reference ? <span>· {transfer.reference}</span> : null}</p></div><p className="text-xs tabular-nums text-muted-foreground">{formatDate(transfer.happenedAt)}</p></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun transfert dans ce périmètre.</p>}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="assets"><div className="grid gap-6 xl:grid-cols-2"><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Sites clients</h2></div>{initialData.sites.length ? <div className="divide-y">{initialData.sites.map((site) => <div key={site.id} className="flex items-center gap-3 px-5 py-3"><MapPin className="size-4 text-primary" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{site.client.name} · {site.label}</p><p className="truncate text-xs text-muted-foreground">{site.address1}{site.city ? `, ${site.postalCode || ""} ${site.city}` : ""}</p></div><span className="text-xs tabular-nums text-muted-foreground">{site._count.equipments} équip.</span></div>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun site.</p>}</section><section className="overflow-hidden rounded-xl border bg-card"><div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Parc installé</h2></div>{initialData.equipments.length ? <div className="divide-y">{initialData.equipments.map((equipment) => <Link key={equipment.id} href={`/dashboard/service/equipements/${equipment.id}`} className="block px-5 py-3 hover:bg-muted/35"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium hover:text-primary hover:underline">{equipment.label}</p><Badge variant="outline">{equipment.status}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{equipment.site.client.name} · {equipment.site.label}{equipment.serialNumber ? ` · S/N ${equipment.serialNumber}` : ""}</p></Link>)}</div> : <p className="px-5 py-10 text-sm text-muted-foreground">Aucun équipement installé.</p>}</section></div></TabsContent>
      </Tabs>
      <Dialog open={Boolean(planningInterventionId)} onOpenChange={(open) => { if (!open) setPlanningInterventionId(null) }}><DialogContent><PlanningDialogForm intervention={initialData.interventions.find((item) => item.id === planningInterventionId)} members={initialData.members} isPending={isPending} onCancel={() => setPlanningInterventionId(null)} onSubmit={submitInterventionPlanning} /></DialogContent></Dialog>
      <Dialog open={Boolean(completionId)} onOpenChange={(open) => { if (!open) { setCompletionId(null); setCompletionSignatureData("") } }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><form onSubmit={submitCompletion} className="space-y-4"><DialogHeader><DialogTitle>Clôturer l’intervention</DialogTitle></DialogHeader><Field label="Compte rendu terrain" name="report" required><textarea id="report" name="report" required className="min-h-32 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Travaux réalisés, contrôles et éventuelles réserves…" /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Temps passé (minutes)" name="laborMinutes" required><Input id="laborMinutes" name="laborMinutes" type="number" min="0" defaultValue="60" required /></Field><Field label="Nom du client présent" name="customerName" required><Input id="customerName" name="customerName" required /></Field></div><div className="space-y-2"><p className="text-sm font-medium">Signature manuscrite du client *</p><SignatureCanvas disabled={isPending} onSave={setCompletionSignatureData} onClear={() => setCompletionSignatureData("")} />{completionSignatureData ? <Badge variant="secondary"><ShieldCheck />Signature capturée</Badge> : <p className="text-xs text-muted-foreground">Demandez au client de signer dans le cadre ci-dessus puis confirmez la signature.</p>}</div><label className="flex items-start gap-3 rounded-lg border p-3 text-sm"><input name="customerApproval" type="checkbox" required className="mt-0.5 size-4" /><span>Le client confirme le compte rendu et la fin de l’intervention. La signature et l’empreinte horodatée seront conservées dans le dossier.</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => { setCompletionId(null); setCompletionSignatureData("") }}>Annuler</Button><Button type="submit" disabled={isPending || !completionSignatureData}>{isPending ? <Loader2 className="animate-spin" /> : null}Valider la clôture</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(materialInterventionId)} onOpenChange={(open) => { if (!open) setMaterialInterventionId(null) }}><DialogContent><form onSubmit={submitInterventionMaterial} className="space-y-4"><DialogHeader><DialogTitle>Matériel utilisé en intervention</DialogTitle></DialogHeader><Field label="Dépôt" name="materialWarehouseId" required><NativeSelect name="materialWarehouseId" required>{initialData.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="materialProductId" required><NativeSelect name="materialProductId" required>{initialData.products.filter((product) => product.stockTracked).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}</NativeSelect></Field><Field label="Quantité consommée" name="materialQuantity" required><Input id="materialQuantity" name="materialQuantity" type="number" min="1" step="1" defaultValue="1" required /></Field><p className="text-xs leading-5 text-muted-foreground">La quantité est sortie du dépôt dans une transaction unique. Le coût d’achat du catalogue est figé sur le mouvement pour conserver l’historique.</p><DialogFooter><Button type="button" variant="outline" onClick={() => setMaterialInterventionId(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : <PackageMinus />}Consommer</Button></DialogFooter></form></DialogContent></Dialog>
      <Dialog open={Boolean(deliverySignId)} onOpenChange={(open) => { if (!open) setDeliverySignId(null) }}><DialogContent><form onSubmit={submitDeliverySignature} className="space-y-4"><DialogHeader><DialogTitle>Signer le bon de livraison</DialogTitle></DialogHeader><Field label="Nom du réceptionnaire" name="deliverySignatureRecipientName" required><Input id="deliverySignatureRecipientName" name="recipientName" required /></Field><label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm"><input name="customerApproval" type="checkbox" required className="mt-0.5 size-4" /><span>Le réceptionnaire confirme les quantités indiquées et la réception. Le bon sera horodaté et scellé par empreinte SHA-256.</span></label><DialogFooter><Button type="button" variant="outline" onClick={() => setDeliverySignId(null)}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : <PenLine />}Signer et sceller</Button></DialogFooter></form></DialogContent></Dialog>
    </div>
  )
}

function OperationsOverview({ data, onCreate }: { data: OperationsData; onCreate: (kind: CreateKind) => void }) {
  const today = new Date()
  const dayEnd = new Date(today)
  dayEnd.setHours(23, 59, 59, 999)
  const upcomingInterventions = data.interventions
    .filter((item) => !["COMPLETED", "CANCELED"].includes(item.status) && new Date(item.scheduledStart) <= dayEnd)
    .slice(0, 6)
  const priorityTickets = data.tickets
    .filter((ticket) => !["RESOLVED", "CLOSED"].includes(ticket.status))
    .slice(0, 6)
  const criticalProducts = data.products
    .map((product) => {
      const quantity = product.inventoryItems.reduce((sum, item) => sum + item.quantity, 0)
      const reserved = product.inventoryItems.reduce((sum, item) => sum + item.reservedQuantity, 0)
      const threshold = product.inventoryItems.reduce((sum, item) => sum + item.reorderPoint, 0)
      return { ...product, available: quantity - reserved, threshold }
    })
    .filter((product) => product.stockTracked && product.available <= product.threshold)
    .slice(0, 5)
  const activeOrders = data.purchaseOrders
    .filter((order) => !["RECEIVED", "CANCELED"].includes(order.status))
    .slice(0, 5)
  const hasPriority = upcomingInterventions.length + priorityTickets.length + criticalProducts.length + activeOrders.length > 0

  if (!hasPriority) {
    const quickActions: Array<{ label: string; detail: string; kind: CreateKind; icon: LucideIcon }> = [
      { label: "Planifier", detail: "Intervention terrain", kind: "INTERVENTION", icon: CalendarDays },
      { label: "Ouvrir un ticket", detail: "Demande SAV", kind: "TICKET", icon: Wrench },
      { label: "Commander", detail: "Besoin client", kind: "CUSTOMER_ORDER", icon: ClipboardList },
      { label: "Ajuster le stock", detail: "Entrée ou sortie", kind: "STOCK", icon: Boxes },
    ]
    return <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]"><div className="flex flex-col gap-4 border-b px-4.5 py-4 sm:flex-row sm:items-center"><span className="grid size-10 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><CheckCircle2 className="size-5" /></span><div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold">Aucune priorité opérationnelle</h2><p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">Pas d’intervention échue, de ticket ouvert, de stock critique ni de commande fournisseur en attente.</p></div><Badge variant="secondary">Sous contrôle</Badge></div><div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">{quickActions.map((action) => <button key={action.kind} type="button" onClick={() => onCreate(action.kind)} className="group flex min-h-20 items-center gap-3 bg-card px-4 py-3 text-left transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/9 text-primary"><action.icon className="size-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{action.label}</span><span className="mt-0.5 block text-xs text-muted-foreground">{action.detail}</span></span><Plus className="size-3.5 text-muted-foreground transition-transform group-hover:rotate-90 group-hover:text-primary" /></button>)}</div></section>
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]">
        <header className="flex items-start justify-between gap-3 border-b px-4.5 py-3.5"><div><h2 className="text-sm font-semibold">Interventions du jour</h2><p className="mt-0.5 text-xs text-muted-foreground">Créneaux arrivés ou planifiés aujourd’hui.</p></div><Badge variant="secondary">{upcomingInterventions.length}</Badge></header>
        {upcomingInterventions.length ? <div className="divide-y">{upcomingInterventions.map((item) => <Link key={item.id} href={`/dashboard/service/interventions/${item.id}`} className="grid gap-2 px-4.5 py-3 transition-colors hover:bg-muted/35 sm:grid-cols-[64px_minmax(0,1fr)_130px] sm:items-center"><span className="text-xs font-semibold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledStart))}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{item.site.client.name} · {item.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.site.label}</span></span><span className="truncate text-xs text-muted-foreground sm:text-right">{item.assignedMembership?.user.name || item.assignedMembership?.user.email || "Non affectée"}</span></Link>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center gap-3 px-4.5 py-5 text-center"><p className="text-sm text-muted-foreground">Aucune intervention à traiter aujourd’hui.</p><Button type="button" size="sm" variant="outline" onClick={() => onCreate("INTERVENTION")}><CalendarDays />Planifier une intervention</Button></div>}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]">
        <header className="flex items-start justify-between gap-3 border-b px-4.5 py-3.5"><div><h2 className="text-sm font-semibold">File SAV prioritaire</h2><p className="mt-0.5 text-xs text-muted-foreground">Tickets ouverts classés par priorité et activité récente.</p></div><Badge variant="secondary">{priorityTickets.length}</Badge></header>
        {priorityTickets.length ? <div className="divide-y">{priorityTickets.map((ticket) => <Link key={ticket.id} href={`/dashboard/service/tickets/${ticket.id}`} className="flex items-center gap-3 px-4.5 py-3 transition-colors hover:bg-muted/35"><span className={`size-2 shrink-0 rounded-full ${ticket.priority === "URGENT" ? "bg-danger" : ticket.priority === "HIGH" ? "bg-warning" : "bg-primary"}`} /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{ticket.client.name} · {ticket.title}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{ticket.number}{ticket.equipment ? ` · ${ticket.equipment.label}` : ""}</span></span><Badge variant={ticket.priority === "URGENT" ? "destructive" : "outline"}>{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}</Badge></Link>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center gap-3 px-4.5 py-5 text-center"><p className="text-sm text-muted-foreground">Aucun ticket SAV ouvert.</p><Button type="button" size="sm" variant="outline" onClick={() => onCreate("TICKET")}><Wrench />Ouvrir un ticket</Button></div>}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]">
        <header className="flex items-start justify-between gap-3 border-b px-4.5 py-3.5"><div><h2 className="text-sm font-semibold">Stock critique</h2><p className="mt-0.5 text-xs text-muted-foreground">Disponibilité nette inférieure ou égale au seuil.</p></div><Badge variant={criticalProducts.length ? "destructive" : "secondary"}>{criticalProducts.length}</Badge></header>
        {criticalProducts.length ? <div className="divide-y">{criticalProducts.map((product) => <div key={product.id} className="grid grid-cols-[minmax(0,1fr)_80px_80px] items-center gap-3 px-4.5 py-3"><span className="min-w-0"><span className="block truncate text-sm font-medium">{product.label}</span><span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">{product.sku}</span></span><span className="text-right text-xs font-semibold tabular-nums text-danger">{product.available} dispo.</span><span className="text-right text-xs text-muted-foreground">seuil {product.threshold}</span></div>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center gap-3 px-4.5 py-5 text-center"><p className="text-sm text-muted-foreground">Aucune rupture ou alerte de stock.</p><Button type="button" size="sm" variant="outline" onClick={() => onCreate("STOCK")}><Boxes />Enregistrer un mouvement</Button></div>}
      </section>

      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(13,36,66,0.035)]">
        <header className="flex items-start justify-between gap-3 border-b px-4.5 py-3.5"><div><h2 className="text-sm font-semibold">Commandes fournisseurs</h2><p className="mt-0.5 text-xs text-muted-foreground">Achats non réceptionnés à suivre.</p></div><Badge variant="secondary">{activeOrders.length}</Badge></header>
        {activeOrders.length ? <div className="divide-y">{activeOrders.map((order) => <Link key={order.id} href={`/dashboard/operations/achats/${order.id}`} className="grid gap-2 px-4.5 py-3 transition-colors hover:bg-muted/35 sm:grid-cols-[110px_minmax(0,1fr)_110px] sm:items-center"><span className="font-mono text-xs font-semibold">{order.number}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{order.supplier.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{order.project?.name || "Sans chantier"}</span></span><Badge variant="outline" className="justify-self-start sm:justify-self-end">{order.status}</Badge></Link>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center gap-3 px-4.5 py-5 text-center"><p className="text-sm text-muted-foreground">Aucune commande fournisseur active.</p><Button type="button" size="sm" variant="outline" onClick={() => onCreate("SUPPLIER")}><ClipboardList />Préparer un fournisseur</Button></div>}
      </section>
    </div>
  )
}

function AgencyComparison({ data, selectedAgencyId }: { data: OperationsData; selectedAgencyId: string }) {
  const rows = data.agencies.map((agency) => {
    const warehouseIds = new Set(data.warehouses.filter((warehouse) => warehouse.agencyId === agency.id).map((warehouse) => warehouse.id))
    const inventory = data.products.flatMap((product) => product.inventoryItems
      .filter((item) => warehouseIds.has(item.warehouseId))
      .map((item) => ({ ...item, purchasePriceCents: product.purchasePriceCents })))
    const quantity = inventory.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = inventory.reduce((sum, item) => sum + item.reservedQuantity, 0)
    return {
      ...agency,
      warehouses: warehouseIds.size,
      sites: data.sites.filter((site) => site.agencyId === agency.id).length,
      projects: data.projects.filter((project) => project.agencyId === agency.id).length,
      members: data.members.filter((member) => member.agencyMemberships.some((membership) => membership.agencyId === agency.id)).length,
      available: quantity - reserved,
      stockValueCents: inventory.reduce((sum, item) => sum + item.quantity * item.purchasePriceCents, 0),
    }
  })
  if (rows.length <= 1) return null
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><h2 className="text-sm font-semibold">Comparaison des agences</h2><p className="mt-1 text-xs text-muted-foreground">Charge opérationnelle et stock physique, calculés à partir des rattachements actuels.</p></div>
      <div className="grid gap-px bg-border [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
        {rows.map((row) => <article key={row.id} className={`bg-card p-5 ${selectedAgencyId === row.id ? "ring-2 ring-inset ring-primary" : ""}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{row.name}</p>{row.isDefault ? <Badge variant="secondary">Principale</Badge> : null}</div><dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Sites / chantiers</dt><dd className="mt-1 font-semibold tabular-nums">{row.sites} / {row.projects}</dd></div><div><dt className="text-muted-foreground">Dépôts / équipe</dt><dd className="mt-1 font-semibold tabular-nums">{row.warehouses} / {row.members}</dd></div><div><dt className="text-muted-foreground">Disponible</dt><dd className="mt-1 font-semibold tabular-nums">{row.available} unités</dd></div><div><dt className="text-muted-foreground">Valeur achat</dt><dd className="mt-1 font-semibold tabular-nums">{formatMoney(row.stockValueCents)}</dd></div></dl></article>)}
      </div>
    </section>
  )
}

function InterventionCostSummary({ intervention }: { intervention: OperationsData["interventions"][number] }) {
  const materialCost = intervention.stockMovements.reduce((sum, movement) => sum + Math.abs(movement.quantity) * (movement.unitCostCents ?? 0), 0)
  const hourlyCost = intervention.assignedMembership?.hourlyCostCents ?? 0
  const laborCost = Math.round(intervention.laborMinutes * hourlyCost / 60)
  const expenseCost = intervention.expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
  if (!intervention.stockMovements.length && !laborCost && !expenseCost) return null
  return (
    <div className="mt-3 rounded-lg border bg-muted/35 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">Coût réel interne</span><span className="font-semibold tabular-nums">{formatMoney(materialCost + laborCost + expenseCost)}</span></div>
      <p className="mt-1 text-muted-foreground">Matériel {formatMoney(materialCost)} · Main-d’œuvre {formatMoney(laborCost)} · Frais {formatMoney(expenseCost)}</p>
      {intervention.stockMovements.length ? <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">{intervention.stockMovements.map((movement) => <li key={movement.id}>{Math.abs(movement.quantity)} × {movement.product.label} · {movement.warehouse.name}</li>)}</ul> : null}
      {intervention.expenses.length ? <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">{intervention.expenses.map((expense) => <li key={expense.id}>{expense.label} · {formatMoney(expense.amountCents)} · {expense.status === "JUSTIFIED" ? "justifié" : "à justifier"}</li>)}</ul> : null}
    </div>
  )
}

function datetimeLocalValue(value: Date | string | null) {
  if (!value) return ""
  const date = new Date(value)
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function PlanningDialogForm({
  intervention,
  members,
  isPending,
  onCancel,
  onSubmit,
}: {
  intervention: OperationsData["interventions"][number] | undefined
  members: OperationsData["members"]
  isPending: boolean
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  if (!intervention) return null
  return (
    <form key={intervention.id} onSubmit={onSubmit} className="space-y-4">
      <DialogHeader><DialogTitle>Replanifier l’intervention</DialogTitle></DialogHeader>
      <div className="rounded-lg border bg-muted/35 p-3"><p className="text-sm font-semibold">{intervention.title}</p><p className="mt-1 text-xs text-muted-foreground">{intervention.site.client.name} · {intervention.site.label}</p></div>
      <Field label="Intervenant" name="planningAssignedMembershipId"><select id="planningAssignedMembershipId" name="planningAssignedMembershipId" defaultValue={intervention.assignedMembershipId ?? ""} className="h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-3 focus:ring-ring/20"><option value="">Non affectée</option>{members.map((member) => <option key={member.id} value={member.id}>{member.user.name || member.user.email}</option>)}</select></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Début" name="planningScheduledStart" required><Input id="planningScheduledStart" name="planningScheduledStart" type="datetime-local" defaultValue={datetimeLocalValue(intervention.scheduledStart)} required /></Field>
        <Field label="Fin" name="planningScheduledEnd" required><Input id="planningScheduledEnd" name="planningScheduledEnd" type="datetime-local" defaultValue={datetimeLocalValue(planningEnd(intervention))} required /></Field>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">Le créneau est vérifié avec les autres interventions de l’intervenant avant l’enregistrement.</p>
      <DialogFooter><Button type="button" variant="outline" onClick={onCancel}>Annuler</Button><Button type="submit" disabled={isPending}>{isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />}Enregistrer</Button></DialogFooter>
    </form>
  )
}

function RouteOverview({ interventions }: { interventions: OperationsData["interventions"] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = interventions
    .filter((item) => item.status !== "CANCELED" && new Date(item.scheduledStart) >= today)
    .sort((left, right) => new Date(left.scheduledStart).getTime() - new Date(right.scheduledStart).getTime())
  const byDay = new Map<string, typeof upcoming>()
  for (const intervention of upcoming) {
    const key = new Intl.DateTimeFormat("fr-CA").format(new Date(intervention.scheduledStart))
    const day = byDay.get(key) ?? []
    day.push(intervention)
    byDay.set(key, day)
  }
  const days = [...byDay.entries()].slice(0, 14)
  if (!days.length) return null
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Navigation className="size-4 text-primary" />Tournées à venir</h2><p className="mt-1 text-xs text-muted-foreground">Ordre chronologique par intervenant et distance à vol d’oiseau ; les trajets routiers restent à confirmer dans l’outil de navigation.</p></div>
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        {days.map(([dayKey, items]) => {
          const byMember = new Map<string, typeof items>()
          for (const item of items) {
            const key = item.assignedMembershipId ?? "unassigned"
            const route = byMember.get(key) ?? []
            route.push(item)
            byMember.set(key, route)
          }
          let distanceKm = 0
          let measuredLegs = 0
          let totalLegs = 0
          for (const route of byMember.values()) {
            const distance = routeDistanceKm(route.map((item) => item.site))
            distanceKm += distance.distanceKm
            measuredLegs += distance.measuredLegs
            totalLegs += distance.totalLegs
          }
          const conflicts = items.filter((item, index) => item.assignedMembershipId && items.some((other, otherIndex) => otherIndex !== index && other.assignedMembershipId === item.assignedMembershipId && planningSlotsOverlap(item, other)))
          return (
            <article key={dayKey} className="overflow-hidden rounded-xl border">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/25 px-4 py-3"><div><p className="text-sm font-semibold capitalize">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${dayKey}T12:00:00`))}</p><p className="mt-0.5 text-xs text-muted-foreground">{items.length} intervention{items.length > 1 ? "s" : ""}{totalLegs ? ` · ${distanceKm.toFixed(1)} km estimés (${measuredLegs}/${totalLegs} tronçons)` : ""}</p></div>{conflicts.length ? <Badge variant="destructive">{conflicts.length} créneau{conflicts.length > 1 ? "x" : ""} en conflit</Badge> : <Badge variant="secondary">Planning cohérent</Badge>}</div>
              <div className="divide-y">{items.map((item) => { const conflict = item.assignedMembershipId && items.some((other) => other.id !== item.id && other.assignedMembershipId === item.assignedMembershipId && planningSlotsOverlap(item, other)); return <div key={item.id} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 px-4 py-3"><p className="text-xs font-semibold tabular-nums">{new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledStart))}</p><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-medium">{item.title}</p>{conflict ? <Badge variant="destructive" className="h-5">Conflit</Badge> : null}</div><p className="mt-1 truncate text-[11px] text-muted-foreground">{item.assignedMembership?.user.name || item.assignedMembership?.user.email || "Non affectée"} · {item.site.label}</p></div></div>})}</div>
            </article>
          )
        })}
      </div>
    </section>
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
  const agencies = <>{data.agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}{agency.isDefault ? " · principale" : ""}</option>)}</>
  if (kind === "SITE") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Agence responsable" name="agencyId"><NativeSelect name="agencyId">{agencies}</NativeSelect></Field><Field label="Libellé" name="label" required><Input id="label" name="label" required placeholder="Domicile / Résidence secondaire" /></Field><Field label="Adresse" name="address1" required><Input id="address1" name="address1" required /></Field><Field label="Code postal" name="postalCode"><Input id="postalCode" name="postalCode" /></Field><Field label="Ville" name="city"><Input id="city" name="city" /></Field><Field label="Latitude" name="latitude"><Input id="latitude" name="latitude" inputMode="decimal" placeholder="48.8566" /></Field><Field label="Longitude" name="longitude"><Input id="longitude" name="longitude" inputMode="decimal" placeholder="2.3522" /></Field></>
  if (kind === "SUPPLIER") return <><Field label="Nom" name="name" required><Input id="name" name="name" required /></Field><Field label="Code" name="code"><Input id="code" name="code" /></Field><Field label="Contact" name="contactName"><Input id="contactName" name="contactName" /></Field><Field label="E-mail" name="email"><Input id="email" name="email" type="email" /></Field></>
  if (kind === "PRODUCT") return <><Field label="Référence / SKU" name="sku" required><Input id="sku" name="sku" required /></Field><Field label="Produit" name="label" required><Input id="label" name="label" required /></Field><Field label="Fournisseur" name="supplierId"><NativeSelect name="supplierId">{suppliers}</NativeSelect></Field><Field label="Famille" name="family"><Input id="family" name="family" placeholder="Pompe, filtration, traitement…" /></Field><Field label="Coût HT (€)" name="purchasePrice"><Input id="purchasePrice" name="purchasePrice" inputMode="decimal" /></Field><Field label="Prix de vente HT (€)" name="salePrice"><Input id="salePrice" name="salePrice" inputMode="decimal" /></Field></>
  if (kind === "WAREHOUSE") return <><Field label="Agence" name="agencyId"><NativeSelect name="agencyId">{agencies}</NativeSelect></Field><Field label="Nom du dépôt" name="name" required><Input id="name" name="name" required /></Field><Field label="Code" name="code" required><Input id="code" name="code" required /></Field><Field label="Adresse" name="address"><Input id="address" name="address" /></Field></>
  if (kind === "EQUIPMENT") return <><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Équipement" name="label" required><Input id="label" name="label" required /></Field><Field label="Produit catalogue" name="productId"><NativeSelect name="productId">{products}</NativeSelect></Field><Field label="N° de série" name="serialNumber"><Input id="serialNumber" name="serialNumber" /></Field><Field label="Installé le" name="installedAt"><Input id="installedAt" name="installedAt" type="date" /></Field><Field label="Garantie jusqu'au" name="warrantyUntil"><Input id="warrantyUntil" name="warrantyUntil" type="date" /></Field></>
  if (kind === "TICKET") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Site" name="siteId"><NativeSelect name="siteId">{sites}</NativeSelect></Field><Field label="Équipement" name="equipmentId"><NativeSelect name="equipmentId">{data.equipments.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.site.client.name} · {equipment.label}</option>)}</NativeSelect></Field><Field label="Assigné à (vide = routage auto)" name="assignedMembershipId"><NativeSelect name="assignedMembershipId">{members}</NativeSelect></Field><Field label="Objet" name="title" required><Input id="title" name="title" required /></Field><Field label="Description" name="description" required><Input id="description" name="description" required /></Field><Field label="Compétence" name="requiredSkill"><Input id="requiredSkill" name="requiredSkill" maxLength={80} placeholder="Déduite de l’équipement si vide" /></Field><Field label="Zone" name="territory"><Input id="territory" name="territory" maxLength={80} placeholder="Déduite du site si vide" /></Field><Field label="Priorité" name="priority"><NativeSelect name="priority"><option value="NORMAL">Normale</option><option value="HIGH">Haute</option><option value="URGENT">Urgente</option><option value="LOW">Faible</option></NativeSelect></Field><Field label="Échéance" name="dueAt"><Input id="dueAt" name="dueAt" type="datetime-local" /></Field></>
  if (kind === "INTERVENTION") return <><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Ticket SAV" name="ticketId"><NativeSelect name="ticketId">{data.tickets.map((ticket) => <option key={ticket.id} value={ticket.id}>{ticket.number} · {ticket.title}</option>)}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Intervenant" name="assignedMembershipId"><NativeSelect name="assignedMembershipId">{members}</NativeSelect></Field><Field label="Objet" name="title" required><Input id="title" name="title" required /></Field><Field label="Début" name="scheduledStart" required><Input id="scheduledStart" name="scheduledStart" type="datetime-local" required /></Field><Field label="Fin prévue" name="scheduledEnd"><Input id="scheduledEnd" name="scheduledEnd" type="datetime-local" /></Field></>
  if (kind === "MAINTENANCE") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Site" name="siteId" required><NativeSelect name="siteId" required>{sites}</NativeSelect></Field><Field label="Libellé du contrat" name="label" required><Input id="label" name="label" required placeholder="Entretien annuel couverture" /></Field><Field label="Équipement couvert" name="equipmentId"><NativeSelect name="equipmentId">{data.equipments.map((equipment) => <option key={equipment.id} value={equipment.id}>{equipment.site.client.name} · {equipment.label}</option>)}</NativeSelect></Field><Field label="Début" name="startDate" required><Input id="startDate" name="startDate" type="date" required /></Field><Field label="Fin" name="endDate"><Input id="endDate" name="endDate" type="date" /></Field><Field label="Fréquence" name="frequency"><NativeSelect name="frequency"><option value="ANNUAL">Annuelle</option><option value="BIANNUAL">Semestrielle</option><option value="QUARTERLY">Trimestrielle</option><option value="MONTHLY">Mensuelle</option></NativeSelect></Field><Field label="Prochaine visite" name="nextVisitAt"><Input id="nextVisitAt" name="nextVisitAt" type="date" /></Field><Field label="Prix HT (€)" name="price"><Input id="price" name="price" inputMode="decimal" /></Field><Field label="TVA (%)" name="tvaRate"><Input id="tvaRate" name="tvaRate" type="number" min="0" max="100" step="0.1" defaultValue="20" /></Field><Field label="Échéance facture (jours)" name="invoiceDueDays"><Input id="invoiceDueDays" name="invoiceDueDays" type="number" min="0" max="365" defaultValue="30" /></Field><Field label="Notes" name="notes"><Input id="notes" name="notes" /></Field><label className="flex items-start gap-3 rounded-[10px] border p-3 text-sm sm:col-span-2"><input name="autoInvoice" type="checkbox" className="mt-0.5 size-4" /><span><strong className="block">Facturation automatique</strong><span className="mt-1 block text-xs text-muted-foreground">Crée un modèle récurrent aligné sur la fréquence du contrat.</span></span></label></>
  if (kind === "STOCK") return <><Field label="Dépôt" name="warehouseId" required><NativeSelect name="warehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="productId" required><NativeSelect name="productId" required>{products}</NativeSelect></Field><Field label="Mouvement" name="type" required><NativeSelect name="type" required><option value="IN">Entrée</option><option value="OUT">Sortie</option><option value="RESERVE">Réserver chantier</option><option value="RELEASE">Libérer réservation</option><option value="CONSUME">Consommer</option><option value="ADJUST">Ajustement signé</option></NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" required defaultValue="1" /></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Référence" name="reference"><Input id="reference" name="reference" /></Field></>
  if (kind === "TRANSFER") return <><Field label="Dépôt de départ" name="fromWarehouseId" required><NativeSelect name="fromWarehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Dépôt d’arrivée" name="toWarehouseId" required><NativeSelect name="toWarehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit suivi" name="productId" required><NativeSelect name="productId" required>{data.products.filter((product) => product.stockTracked).map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.label}</option>)}</NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="1" step="1" defaultValue="1" required /></Field><Field label="Référence" name="reference"><Input id="reference" name="reference" placeholder="Bon interne, véhicule…" /></Field><Field label="Notes" name="notes"><Input id="notes" name="notes" placeholder="Motif ou consigne logistique" /></Field></>
  if (kind === "CUSTOMER_ORDER") return <><Field label="Client" name="clientId" required><NativeSelect name="clientId" required>{clients}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field><Field label="Produit" name="productId"><NativeSelect name="productId">{products}</NativeSelect></Field><Field label="Libellé" name="label" required><Input id="label" name="label" required /></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></Field><Field label="Prix unitaire HT (€)" name="unitPrice" required><Input id="unitPrice" name="unitPrice" inputMode="decimal" required /></Field><Field label="TVA (%)" name="tvaRate"><Input id="tvaRate" name="tvaRate" type="number" min="0" max="100" step="0.1" defaultValue="20" /></Field><Field label="Acompte (€)" name="deposit"><Input id="deposit" name="deposit" inputMode="decimal" /></Field><Field label="Pose prévue" name="expectedInstallationAt"><Input id="expectedInstallationAt" name="expectedInstallationAt" type="date" /></Field></>
  if (kind === "RESERVATION") return <><Field label="Dépôt" name="warehouseId" required><NativeSelect name="warehouseId" required>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</NativeSelect></Field><Field label="Produit" name="productId" required><NativeSelect name="productId" required>{products}</NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required /></Field><Field label="Commande client" name="customerOrderId"><NativeSelect name="customerOrderId">{data.customerOrders.filter((order) => !["DELIVERED", "COMPLETED", "CANCELLED"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.client.name}</option>)}</NativeSelect></Field><Field label="Chantier" name="projectId"><NativeSelect name="projectId">{projects}</NativeSelect></Field></>
  if (kind === "DELIVERY") return <><Field label="Commande client" name="customerOrderId" required><NativeSelect name="customerOrderId" required>{data.customerOrders.filter((order) => !["DELIVERED", "CANCELLED"].includes(order.status)).map((order) => <option key={order.id} value={order.id}>{order.number} · {order.client.name}</option>)}</NativeSelect></Field><Field label="Ligne livrée" name="customerOrderLineId" required><NativeSelect name="customerOrderLineId" required>{data.customerOrders.flatMap((order) => order.lines.filter((line) => line.deliveredQuantity < line.quantity).map((line) => <option key={line.id} value={line.id}>{order.number} · {line.label} · reste {line.quantity - line.deliveredQuantity}</option>))}</NativeSelect></Field><Field label="Quantité" name="quantity" required><Input id="quantity" name="quantity" type="number" min="0.01" step="0.01" defaultValue="1" required /></Field><Field label="Réceptionnaire" name="recipientName"><Input id="recipientName" name="recipientName" /></Field></>
  return null
}
