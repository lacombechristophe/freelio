import { Activity, Calculator, CircleDollarSign, Receipt, Repeat2, TriangleAlert, Wallet } from "lucide-react"

import { getWorkspaceOverview } from "@/actions/workspaces"
import { formatWorkspaceDate, formatWorkspaceEuro, WorkspaceHub } from "@/app/dashboard/_components/workspace-hub"
import { WorkspaceDistributionPanel, WorkspaceTrendPanel } from "@/app/dashboard/_components/workspace-insights"
import { OnboardingRequired } from "@/components/shared/onboarding-required"

export default async function RevenueWorkspacePage() {
  const data = await getWorkspaceOverview("REVENUE")
  if (!data) return <OnboardingRequired title="Configurez votre espace" description="Créez le profil entreprise avant de piloter les revenus." />
  const now = new Date()
  const aging = [
    { label: "À échoir", min: Number.NEGATIVE_INFINITY, max: 0 },
    { label: "0–30 jours", min: 1, max: 30 },
    { label: "31–60 jours", min: 31, max: 60 },
    { label: "+60 jours", min: 61, max: Number.POSITIVE_INFINITY },
  ].map((bucket) => ({
    label: bucket.label,
    value: data.outstandingInvoices.filter((invoice) => {
      const days = Math.floor((now.getTime() - invoice.dueDate.getTime()) / 86_400_000)
      return days >= bucket.min && days <= bucket.max
    }).reduce((sum, invoice) => sum + Math.max(0, invoice.totalTtcCents - invoice.paidAmountCents), 0) / 100,
  }))

  return (
    <WorkspaceHub
      featuredPosition="after-panels"
      eyebrow="Espace revenus"
      title="Facturation et trésorerie"
      description="Suivez ce qui doit être facturé, encaissé, rapproché ou transmis à la comptabilité."
      primaryAction={{ name: "Nouvelle facture", href: "/dashboard/factures/new", icon: Receipt, description: "Émettre une facture" }}
      metrics={[
        { label: "Reste à encaisser", value: formatWorkspaceEuro(data.outstandingCents), detail: "Factures émises non soldées", icon: CircleDollarSign, tone: "teal", href: "/dashboard/factures" },
        { label: "Factures en retard", value: data.overdueInvoices, detail: "Échéance dépassée", icon: TriangleAlert, tone: "red", alert: data.overdueInvoices > 0, status: data.overdueInvoices ? "À relancer" : "À jour", href: "/dashboard/factures" },
        { label: "Contrats actifs", value: data.maintenanceContracts, detail: "Entretien et récurrence", icon: Repeat2, tone: "blue", href: "/dashboard/factures/recurrentes" },
        { label: "Achats à suivre", value: data.pendingPurchases, detail: "Commandes non clôturées", icon: Wallet, tone: "amber", href: "/dashboard/operations?tab=stock" },
      ]}
      featured={<div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]"><WorkspaceTrendPanel title="Encaissements enregistrés" description={`Flux de règlements réels sur 30 jours · ${formatWorkspaceEuro(data.paymentsLast90DaysCents)} sur 90 jours.`} labels={data.paymentSeries.labels} series={data.paymentSeries.series} valueSuffix=" €" href="/dashboard/comptabilite/banque" linkLabel="Ouvrir le rapprochement bancaire" /><WorkspaceDistributionPanel title="Balance âgée" description="Reste à encaisser, ventilé selon l’ancienneté de l’échéance." items={aging.map((bucket) => ({ ...bucket, detail: `${formatWorkspaceEuro(Math.round(bucket.value * 100))} restant` }))} href="/dashboard/factures" linkLabel="Voir le détail de la balance" /></div>}
      panels={[
        {
          title: "Encaissements à sécuriser",
          description: "Factures non soldées classées par échéance.",
          rows: data.recentInvoices.filter((invoice) => invoice.totalTtcCents > invoice.paidAmountCents && !["DRAFT", "PAID"].includes(invoice.status)).map((invoice) => ({
            title: `${invoice.number} · ${invoice.client.name}`,
            detail: invoice.object,
            meta: formatWorkspaceEuro(invoice.totalTtcCents - invoice.paidAmountCents),
            status: invoice.dueDate < new Date() ? "En retard" : formatWorkspaceDate(invoice.dueDate),
            tone: invoice.dueDate < new Date() ? "red" : "amber",
            href: `/dashboard/factures/${invoice.id}`,
            icon: Receipt,
          })),
          empty: "Aucun encaissement à sécuriser.",
          href: "/dashboard/factures",
          linkLabel: "Voir tous les encaissements",
        },
        {
          title: "Factures récentes",
          description: "Derniers documents émis et état de règlement.",
          rows: data.recentInvoices.slice(0, 6).map((invoice) => ({
            title: invoice.number,
            detail: `${invoice.client.name} · ${invoice.object}`,
            meta: formatWorkspaceEuro(invoice.totalTtcCents),
            status: invoice.status,
            tone: invoice.status === "PAID" ? "teal" : invoice.status === "OVERDUE" ? "red" : "blue",
            href: `/dashboard/factures/${invoice.id}`,
            icon: CircleDollarSign,
          })),
          empty: "Aucune facture récente.",
          href: "/dashboard/factures",
          linkLabel: "Voir toutes les factures",
        },
      ]}
      sections={[
        {
          title: "Encaissements à sécuriser",
          description: "Émettre, récurrer et suivre les règlements sans perdre une échéance.",
          links: [
            { name: "Factures", href: "/dashboard/factures", icon: Receipt, description: "Factures, acomptes, avoirs et paiements." },
            { name: "Facturation récurrente", href: "/dashboard/factures/recurrentes", icon: Repeat2, description: "Échéances automatiques et occurrences." },
            { name: "Dépenses", href: "/dashboard/depenses", icon: Wallet, description: "Achats, frais et justificatifs." },
          ],
        },
        {
          title: "Contrôle financier",
          description: "Rapprocher les flux et préparer la comptabilité sans double saisie.",
          links: [
            { name: "Banque", href: "/dashboard/comptabilite/banque", icon: Activity, description: "Importer et rapprocher les mouvements." },
            { name: "Comptabilité", href: "/dashboard/comptabilite", icon: Calculator, description: "Journaux, TVA et exports précomptables." },
          ],
        },
      ]}
    />
  )
}
