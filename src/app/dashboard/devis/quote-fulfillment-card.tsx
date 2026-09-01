import type { ElementType } from "react"
import Link from "next/link"
import { Check, CircleDashed, ClipboardList, FileText, PackageCheck, ScrollText, Wrench } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type Artifact = { id: string; number: string; status: string }

type QuoteFulfillmentCardProps = {
  accepted: boolean
  order: (Artifact & { billingStatus: string; invoices: Array<Artifact & { type: string }> }) | null
  project: ({ id: string; name: string; purchaseOrders: Artifact[] }) | null
  contract: Artifact | null
}

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  CONFIRMED: "Confirmée",
  NOT_INVOICED: "Non facturée",
  PARTIALLY_INVOICED: "Partiellement facturée",
  INVOICED: "Facturée",
  SENT: "Envoyé",
  SIGNED: "Signé",
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replaceAll("_", " ").toLocaleLowerCase("fr-FR")
}

function Step({ done, icon: Icon, title, detail, href }: { done: boolean; icon: ElementType; title: string; detail: string; href?: string }) {
  const content = (
    <div className={cn("group flex h-full min-w-0 gap-3 rounded-xl border p-4", done ? "border-success/25 bg-success/5" : "bg-muted/25")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", done ? "bg-success text-white" : "bg-background text-muted-foreground ring-1 ring-border")}>
        {done ? <Check className="size-4" /> : <Icon className="size-4" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold">
          {title}
          <Badge variant={done ? "secondary" : "outline"} className="shrink-0 text-[10px]">{done ? "Prêt" : "À faire"}</Badge>
        </span>
        <span className="mt-1 block break-words text-xs leading-5 text-muted-foreground">{detail}</span>
      </span>
    </div>
  )

  return href ? <Link href={href} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/30">{content}</Link> : content
}

export function QuoteFulfillmentCard({ accepted, order, project, contract }: QuoteFulfillmentCardProps) {
  const invoices = order?.invoices ?? []
  const purchaseOrders = project?.purchaseOrders ?? []

  return (
    <Card id="suite-du-dossier" className="scroll-mt-24 overflow-hidden">
      <CardHeader className="border-b bg-muted/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Suite du dossier</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">Une vue de contrôle unique relie l’accord commercial à la commande, au chantier, aux achats, au contrat et à la facturation.</CardDescription>
          </div>
          <Badge variant={accepted ? "secondary" : "outline"}>{accepted ? "Exécution autorisée" : "En attente d’accord"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Step done={accepted} icon={CircleDashed} title="Accord client" detail={accepted ? "Accord enregistré et statut figé." : "Enregistrez l’accord avant toute commande."} />
          <Step done={Boolean(order)} icon={ClipboardList} title="Commande client" detail={order ? `${order.number} · ${statusLabel(order.billingStatus)}` : "Reprendra les lignes et les totaux du devis."} href={order ? "/dashboard/operations?tab=orders" : undefined} />
          <Step done={Boolean(project)} icon={Wrench} title="Chantier" detail={project ? project.name : "Créé avec la commande pour planifier la pose."} href={project ? `/dashboard/projets/${project.id}` : undefined} />
          <Step done={Boolean(contract)} icon={ScrollText} title="Contrat" detail={contract ? `${contract.number} · ${statusLabel(contract.status)}` : "Fourniture, pose, réception, garanties et sécurité."} href={contract ? `/dashboard/contrats/${contract.id}` : undefined} />
          <Step done={purchaseOrders.length > 0} icon={PackageCheck} title="Approvisionnement" detail={purchaseOrders.length ? `${purchaseOrders.length} commande${purchaseOrders.length > 1 ? "s" : ""} fournisseur rattachée${purchaseOrders.length > 1 ? "s" : ""}.` : "À préparer selon le matériel et le fabricant."} href={project ? "/dashboard/operations?tab=stock" : undefined} />
          <Step done={invoices.length > 0} icon={FileText} title="Facturation" detail={invoices.length ? `${invoices.length} facture${invoices.length > 1 ? "s" : ""} liée${invoices.length > 1 ? "s" : ""} à la commande.` : "Acompte puis solde, sans double facturation."} href={order ? "/dashboard/operations?tab=orders" : undefined} />
        </div>
        {accepted && order ? (
          <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Prochaine action recommandée</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">Contrôlez l’acompte, réservez le stock ou préparez la commande fournisseur avant de confirmer la date de pose.</p>
            </div>
            <Link href="/dashboard/operations?tab=orders" className={buttonVariants({ variant: "outline" })}>Ouvrir les opérations</Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
