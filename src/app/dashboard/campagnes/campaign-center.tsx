"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Activity, BarChart3, CircleAlert, FileText, Link2, Megaphone, Plus, Rocket, Send, Target } from "lucide-react"
import { toast } from "sonner"

import {
  addMarketingCampaignAsset,
  attachSequenceToCampaign,
  createMarketingCampaign,
  enrollCampaignAudience,
  updateMarketingCampaignAssetStatus,
  updateMarketingCampaignStatus,
} from "@/actions/campaigns"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { HelpTip } from "@/components/ui/help-tip"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useConfirm } from "@/components/shared/confirm-provider"

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
  const confirm = useConfirm()
  const [pending, startTransition] = React.useTransition()
  const [selectedChannels, setSelectedChannels] = React.useState<string[]>(["EMAIL"])
  const active = initialData.campaigns.filter((campaign) => campaign.status === "ACTIVE").length
  const plannedBudget = initialData.campaigns.filter((campaign) => !["COMPLETED", "ARCHIVED"].includes(campaign.status)).reduce((sum, campaign) => sum + campaign.budgetCents, 0)
  const attributedLeads = initialData.campaigns.reduce((sum, campaign) => sum + campaign.attributedLeads, 0)
  const deliveries = initialData.campaigns.reduce((sum, campaign) => sum + campaign.deliveryStats.total, 0)

  function run(task: () => Promise<unknown>, success: string, form?: HTMLFormElement) {
    startTransition(
      () =>
        void task()
          .then(() => {
            form?.reset()
            toast.success(success)
            router.refresh()
          })
          .catch((error) => toast.error(error instanceof Error ? error.message : "Action impossible.")),
    )
  }

  async function launchAudience(campaignId: string, campaignName: string, sequenceId: string, audienceSize: number) {
    if (!sequenceId) return
    const accepted = await confirm({
      title: `Inscrire l’audience de « ${campaignName} » ?`,
      description: `Jusqu’à ${audienceSize} prospect(s) du segment seront contrôlés. Seuls les contacts avec une adresse valide et un consentement actif seront inscrits.`,
      confirmLabel: "Inscrire l’audience",
    })
    if (!accepted) return
    startTransition(() => void enrollCampaignAudience({ campaignId, sequenceId })
      .then((result) => {
        const exclusions = result.missingEmail + result.missingConsent + result.optedOut + result.excludedStatus
        const duplicates = result.alreadyEnrolled ? ` · ${result.alreadyEnrolled} déjà inscrit(s)` : ""
        toast.success(`${result.enrolled} prospect(s) inscrit(s)${exclusions ? ` · ${exclusions} exclu(s) par les contrôles` : ""}${duplicates}.`)
        router.refresh()
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Inscription impossible.")))
  }

  return (
    <div className="space-y-6">
      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Megaphone} label="Campagnes actives" value={active} detail={`${initialData.campaigns.length} campagne(s) suivie(s)`} />
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
            <Field label="Audience">
              <select name="segmentId" className={controlClass}>
                <option value="">Audience à préciser</option>
                {initialData.segments.map((segment) => (
                  <option key={segment.id} value={segment.id}>
                    {segment.name} · {segment._count.memberships} membre(s)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsable">
              <select name="ownerMembershipId" className={controlClass}>
                <option value="">Non affecté</option>
                {initialData.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user.name || member.user.email}
                  </option>
                ))}
              </select>
            </Field>
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
              <Button type="submit" disabled={pending || selectedChannels.length === 0}>
                {pending ? <Activity className="animate-spin" /> : <Plus />}Créer la campagne
              </Button>
            </div>
          </form>
        </div>
      </details>

      {initialData.campaigns.length ? (
        <div className="space-y-5">
          {initialData.campaigns.map((campaign) => {
            const completedAssets = campaign.assets.filter((asset) => ["READY", "PUBLISHED"].includes(asset.status)).length
            const assetProgress = campaign.assets.length ? Math.round((completedAssets / campaign.assets.length) * 100) : 0
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
                      onChange={(event) => run(() => updateMarketingCampaignStatus(campaign.id, event.target.value), "Statut de campagne mis à jour.")}
                      disabled={pending}
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
                          {completedAssets}/{campaign.assets.length} prêt(s)
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${assetProgress}%` }} />
                      </div>
                      {campaign.assets.length ? (
                        <div className="mt-3 divide-y rounded-lg border">
                          {campaign.assets.map((asset) => (
                            <div key={asset.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
                                <FileText className="size-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{asset.name}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                  {channelLabels[asset.type] || asset.type}
                                  {asset.dueAt ? ` · échéance ${formatDate(asset.dueAt)}` : ""}
                                </p>
                              </div>
                              <select
                                aria-label={`Statut de ${asset.name}`}
                                value={asset.status}
                                onChange={(event) => run(() => updateMarketingCampaignAssetStatus(asset.id, event.target.value), "Livrable mis à jour.")}
                                disabled={pending}
                                className="h-9 rounded-lg border bg-background px-2 text-xs"
                              >
                                <option value="TODO">À faire</option>
                                <option value="IN_PROGRESS">En cours</option>
                                <option value="READY">Prêt</option>
                                <option value="PUBLISHED">Publié</option>
                                <option value="CANCELLED">Annulé</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Ajoutez les e-mails, formulaires, contenus et actions nécessaires.</p>
                      )}
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
                        <Button type="submit" variant="outline" disabled={pending}>
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
                      {campaign.sequences.length ? (
                        <div className="mt-3 space-y-2">
                          {campaign.sequences.map((sequence) => (
                            <div key={sequence.id} className="rounded-lg border p-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-medium">{sequence.name}</p>
                                <Badge variant="outline">{sequence.status}</Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {sequence._count.enrollments} inscription(s) · {sequence._count.deliveries} envoi(s)
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aucune séquence rattachée.</p>
                      )}
                      <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                          event.preventDefault()
                          const form = event.currentTarget
                          const data = new FormData(form)
                          run(() => attachSequenceToCampaign(campaign.id, String(data.get("sequenceId"))), "Séquence rattachée.", form)
                        }}
                      >
                        <select name="sequenceId" aria-label={`Séquence à rattacher à ${campaign.name}`} required className={controlClass}>
                          <option value="">Choisir une séquence…</option>
                          {initialData.sequences
                            .filter((sequence) => !sequence.campaignId || sequence.campaignId === campaign.id)
                            .map((sequence) => (
                              <option key={sequence.id} value={sequence.id}>
                                {sequence.name} · {sequence.status}
                              </option>
                            ))}
                        </select>
                        <Button type="submit" size="icon" variant="outline" disabled={pending} aria-label="Rattacher la séquence">
                          <Link2 />
                        </Button>
                      </form>
                      {campaign.sequences.some((sequence) => sequence.status === "ACTIVE") && campaign.segment ? (
                        <form
                          className="mt-4 rounded-[10px] border bg-muted/25 p-3"
                          onSubmit={(event) => {
                            event.preventDefault()
                            const data = new FormData(event.currentTarget)
                            void launchAudience(campaign.id, campaign.name, String(data.get("launchSequenceId")), campaign.segment?._count.memberships ?? 0)
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><Rocket className="size-4" /></span>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold">Activer l’audience</p>
                              <p className="mt-1 text-xs leading-5 text-muted-foreground">Contrôle le consentement, les oppositions et les doublons avant toute inscription. Les envois suivent ensuite la fenêtre de la séquence.</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <select name="launchSequenceId" aria-label={`Séquence de diffusion pour ${campaign.name}`} required className={controlClass}>
                              {campaign.sequences.filter((sequence) => sequence.status === "ACTIVE").map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name} · {sequence._count.enrollments} inscrit(s)</option>)}
                            </select>
                            <Button type="submit" disabled={pending || !["PLANNED", "ACTIVE"].includes(campaign.status)} className="shrink-0"><Rocket />Inscrire le segment</Button>
                          </div>
                          {!["PLANNED", "ACTIVE"].includes(campaign.status) ? <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Passez d’abord la campagne au statut Planifiée ou Active.</p> : null}
                        </form>
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
