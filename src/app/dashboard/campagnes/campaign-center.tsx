"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Activity, BarChart3, CircleAlert, Link2, Megaphone, Plus, Send, Target } from "lucide-react"
import { toast } from "sonner"

import {
  addMarketingCampaignAsset,
  attachSequenceToCampaign,
  createMarketingCampaign,
  updateMarketingCampaignStatus,
} from "@/actions/campaigns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CampaignActivation } from "./campaign-activation"
import { CampaignAssets, CampaignChoiceSelect, CampaignEditor, CampaignSequences } from "./campaign-management"

type CampaignData = NonNullable<Awaited<ReturnType<typeof import("@/actions/campaigns").getCampaignDashboard>>>
const controlClass = "h-10 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/20"
const channels = ["EMAIL", "SMS", "FORM", "SOCIAL", "ADS", "EVENT", "CONTENT"] as const
const channelLabels: Record<string, string> = {
  EMAIL: "E-mail",
  SMS: "SMS",
  FORM: "Formulaire",
  SOCIAL: "Réseaux sociaux",
  ADS: "Publicité",
  EVENT: "Événement",
  CONTENT: "Contenu",
}
const statusLabels: Record<string, string> = {
  DRAFT: "Brouillon",
  PLANNED: "Planifiée",
  ACTIVE: "Active",
  PAUSED: "En pause",
  COMPLETED: "Terminée",
  TODO: "À faire",
  IN_PROGRESS: "En cours",
  READY: "Prêt",
  PUBLISHED: "Publié",
  CANCELLED: "Annulé",
}

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value)) : "Non planifiée"
}
function formatEuro(cents: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(cents / 100)
}

export function CampaignCenter({ initialData }: { initialData: CampaignData }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [selectedChannels, setSelectedChannels] = React.useState<string[]>(["EMAIL"])
  const { active, plannedBudget, attributedLeads, deliveries } = initialData.summary
  const navigate = (page: number, search = initialData.search) => startTransition(() => router.push(`/dashboard/campagnes?${new URLSearchParams({ search, page: String(page) })}`))

  function run(task: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(
      () =>
        void task()
          .then((result) => {
            if (result && typeof result === "object" && "success" in result && result.success === false) throw new Error("error" in result ? String(result.error) : "Action impossible")
            form?.reset()
            toast.success(success)
            router.refresh()
          })
          .catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")),
    )
  }


  return (
    <div className="space-y-6">
      <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Megaphone} label="Campagnes actives" value={active} detail={`${initialData.total} campagne(s) suivie(s)`} />
        <Metric icon={Target} label="Prospects attribués" value={attributedLeads} detail="Via le paramètre UTM" />
        <Metric icon={Send} label="E-mails suivis" value={deliveries} detail="Séquences rattachées" />
        <Metric icon={BarChart3} label="Budget planifié" value={formatEuro(plannedBudget)} detail="Campagnes non terminées" />
      </section>

      <details className="group rounded-xl border bg-card">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
            <Plus className="size-4" />
          </span>
          Créer une campagne<span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Audience, canaux, période et budget</span>
        </summary>
        <div className="border-t p-5">
          <form
            className="grid gap-4 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault()
              const form = event.currentTarget
              const data = new FormData(form)
              run(
                () =>
                  createMarketingCampaign({
                    name: data.get("name"),
                    objective: data.get("objective"),
                    channels: selectedChannels,
                    segmentId: data.get("segmentId"),
                    ownerMembershipId: data.get("ownerMembershipId"),
                    startAt: data.get("startAt"),
                    endAt: data.get("endAt"),
                    budgetCents: Math.round(Number(data.get("budget") || 0) * 100),
                    utmCampaign: data.get("utmCampaign"),
                    notes: data.get("notes"),
                  }),
                "Campagne créée.",
                form,
              )
            }}
          >
            <Field label="Nom">
              <Input name="name" required placeholder="Lancement gamme printemps" />
            </Field>
            <Field label="Objectif">
              <Input name="objective" required placeholder="Générer des demandes de visite" />
            </Field>
            <CampaignChoiceSelect kind="SEGMENT" label="Audience" name="segmentId" />
            <CampaignChoiceSelect kind="MEMBER" label="Responsable" name="ownerMembershipId" />
            <Field label="Début">
              <Input name="startAt" type="date" />
            </Field>
            <Field label="Fin">
              <Input name="endAt" type="date" />
            </Field>
            <Field label="Budget (€)">
              <Input name="budget" type="number" min="0" step="1" defaultValue="0" />
            </Field>
            <Field label="Code UTM">
              <Input name="utmCampaign" placeholder="printemps-couvertures" />
            </Field>
            <div className="lg:col-span-3">
              <div className="flex items-center gap-2">
                <Label>Canaux</Label>
                <HelpTip label="Choisir les canaux">
                  Les canaux servent à planifier les livrables. Un canal externe n’est diffusé que si son intégration est réellement configurée.
                </HelpTip>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {channels.map((channel) => (
                  <label
                    key={channel}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${selectedChannels.includes(channel) ? "border-primary/40 bg-primary/5 text-foreground" : "text-muted-foreground"}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedChannels.includes(channel)}
                      onChange={(event) => setSelectedChannels((current) => (event.target.checked ? [...current, channel] : current.filter((item) => item !== channel)))}
                    />
                    {channelLabels[channel]}
                  </label>
                ))}
              </div>
            </div>
            <div className="lg:col-span-3">
              <Field label="Notes">
                <Textarea name="notes" rows={3} placeholder="Message, offre, contraintes et validation attendue…" />
              </Field>
            </div>
            <div className="lg:col-span-3">
              <Button demoMutation type="submit" disabled={pending || selectedChannels.length === 0}>
                {pending ? <Activity className="animate-spin" /> : <Plus />}Créer la campagne
              </Button>
            </div>
          </form>
        </div>
      </details>

      <form key={initialData.search} className="flex gap-2" onSubmit={event => { event.preventDefault(); navigate(1, String(new FormData(event.currentTarget).get("search") || "")) }}>
        <Input name="search" aria-label="Rechercher une campagne" maxLength={200} defaultValue={initialData.search} /><Button type="submit" variant="outline" disabled={pending}>Rechercher</Button>
      </form>
      <div className="flex flex-wrap items-center gap-2 text-sm"><Button type="button" variant="outline" disabled={pending || initialData.page <= 1} onClick={() => navigate(initialData.page - 1)}>Page précédente</Button><span>{initialData.total} campagne(s) · Page {initialData.page} sur {initialData.pageCount}</span><Button type="button" variant="outline" disabled={pending || initialData.page >= initialData.pageCount} onClick={() => navigate(initialData.page + 1)}>Page suivante</Button></div>

      {initialData.campaigns.length ? (
        <div className="space-y-5">
          {initialData.campaigns.map((campaign) => {
            const completedAssets = campaign.readyAssetCount
            const assetProgress = campaign.assetCount ? Math.round((completedAssets / campaign.assetCount) * 100) : 0
            return (
              <Card key={campaign.id} className="overflow-hidden">
                <CardHeader className="border-b bg-muted/20">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-lg">{campaign.name}</CardTitle>
                        <Badge variant={campaign.status === "ACTIVE" ? "default" : "outline"}>{statusLabels[campaign.status] || campaign.status}</Badge>
                        {campaign.channels.map((channel) => (
                          <Badge key={channel} variant="secondary">
                            {channelLabels[channel] || channel}
                          </Badge>
                        ))}
                      </div>
                      <CardDescription className="mt-2">{campaign.objective}</CardDescription>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatDate(campaign.startAt)}
                        {campaign.endAt ? ` → ${formatDate(campaign.endAt)}` : ""} ·{" "}
                        {campaign.segment ? `${campaign.segment.name} (${campaign.segment._count.memberships})` : "Audience à préciser"} ·{" "}
                        {campaign.ownerMembership?.user.name || campaign.ownerMembership?.user.email || "Sans responsable"}
                      </p>
                    </div>
                    <select
                      aria-label={`Statut de la campagne ${campaign.name}`}
                      value={campaign.status}
                      onChange={(event) => run(() => updateMarketingCampaignStatus(campaign.id, event.target.value, campaign.version), "Statut de campagne mis à jour.")}
                      disabled={pending || ["COMPLETED", "ARCHIVED"].includes(campaign.status)}
                      className={`${controlClass} w-full lg:w-44`}
                    >
                      <option value="DRAFT">Brouillon</option>
                      <option value="PLANNED">Planifiée</option>
                      <option value="ACTIVE">Active</option>
                      <option value="PAUSED">En pause</option>
                      <option value="COMPLETED">Terminée</option>
                    </select>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  <CampaignEditor campaign={campaign} />
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                    <SmallMetric label="Budget" value={formatEuro(campaign.budgetCents)} />
                    <SmallMetric label="Prospects attribués" value={campaign.attributedLeads} />
                    <SmallMetric label="Livrés" value={campaign.deliveryStats.delivered} />
                    <SmallMetric label="Ouverts" value={campaign.deliveryStats.opened} />
                    <SmallMetric label="Cliqués" value={campaign.deliveryStats.clicked} />
                  </div>
                  <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                    <section>
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Plan de campagne</h3>
                        <span className="text-xs text-muted-foreground">
                          {completedAssets}/{campaign.assetCount} prêt(s)
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${assetProgress}%` }} />
                      </div>
                      <CampaignAssets campaign={campaign} />
                      <form
                        className="mt-3 grid gap-2 sm:grid-cols-[130px_minmax(0,1fr)_150px_auto]"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const form = event.currentTarget
                          const data = new FormData(form)
                          run(
                            () => addMarketingCampaignAsset({ campaignId: campaign.id, type: data.get("type"), name: data.get("name"), dueAt: data.get("dueAt") }),
                            "Livrable ajouté.",
                            form,
                          )
                        }}
                      >
                        <select name="type" aria-label={`Type de livrable pour ${campaign.name}`} className={controlClass}>
                          <option value="EMAIL">E-mail</option>
                          <option value="FORM">Formulaire</option>
                          <option value="SMS">SMS</option>
                          <option value="SOCIAL">Social</option>
                          <option value="ADS">Publicité</option>
                          <option value="CONTENT">Contenu</option>
                          <option value="DOCUMENT">Document</option>
                          <option value="OTHER">Autre</option>
                        </select>
                        <Input name="name" aria-label={`Nom du livrable pour ${campaign.name}`} required placeholder="Ex. E-mail annonce" />
                        <Input name="dueAt" aria-label={`Échéance du livrable pour ${campaign.name}`} type="date" />
                        <Button demoMutation type="submit" variant="outline" disabled={pending}>
                          <Plus />
                          Ajouter
                        </Button>
                      </form>
                    </section>
                    <section>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold">Séquences e-mail</h3>
                        {campaign.segment ? <span className="text-xs text-muted-foreground">Audience : {campaign.segment._count.memberships}</span> : null}
                      </div>
                      <CampaignSequences campaign={campaign} />
                      <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const form = event.currentTarget
                          const data = new FormData(form)
                          run(() => attachSequenceToCampaign(campaign.id, String(data.get("sequenceId"))), "Séquence rattachée.", form)
                        }}
                      >
                        <CampaignChoiceSelect kind="SEQUENCE" name="sequenceId" label={`Séquence à rattacher à ${campaign.name}`} campaignId={campaign.id} required disabled={campaign.audienceLocked || pending} />
                        <Button demoMutation type="submit" size="icon" variant="outline" disabled={pending || campaign.audienceLocked} aria-label="Rattacher la séquence">
                          <Link2 />
                        </Button>
                      </form>
                      {(campaign.activeSequenceCount > 0 && campaign.segment) || campaign.audienceCount > 0 ? (
                        <CampaignActivation campaign={campaign} />
                      ) : (
                        <p className="mt-4 rounded-[10px] border border-dashed p-3 text-xs leading-5 text-muted-foreground">Pour lancer l’audience, associez un segment et une séquence au statut Active.</p>
                      )}
                      {campaign.deliveryStats.failed > 0 && (
                        <p className="mt-3 flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                          <CircleAlert className="size-4" />
                          {campaign.deliveryStats.failed} envoi(s) en erreur à contrôler.
                        </p>
                      )}
                    </section>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-card py-16 text-center">
          <Megaphone className="mx-auto size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm font-semibold">Aucune campagne</p>
          <p className="mt-1 text-xs text-muted-foreground">Créez un dossier pour coordonner audience, canaux, livrables et résultats.</p>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium leading-none">{label}</span>
      {children}
    </label>
  )
}
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Megaphone; label: string; value: string | number; detail: string }) {
  return (
    <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}
function SmallMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
