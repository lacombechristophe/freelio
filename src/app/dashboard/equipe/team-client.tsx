"use client"

import { useState, useTransition } from "react"
import { Check, Clock3, Copy, Euro, Route, Save, ShieldCheck, UserMinus, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import {
  cancelTeamInvitation,
  createTeamInvitation,
  deactivateTeamMember,
  updateTeamMemberServiceSettings,
  updateTeamMemberWorkSettings,
  updateTeamMemberRole,
} from "@/actions/team"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { CompanyRole } from "@/lib/permissions"

const ASSIGNABLE_ROLES: Array<{ value: CompanyRole; label: string }> = [
  { value: "ADMIN", label: "Administrateur" },
  { value: "SALES", label: "Commercial" },
  { value: "OPERATIONS", label: "Planification" },
  { value: "TECHNICIAN", label: "Technicien" },
  { value: "SERVICE", label: "SAV" },
  { value: "ACCOUNTING", label: "Comptabilité" },
  { value: "VIEWER", label: "Lecture seule" },
]

const ROLE_LABELS: Record<CompanyRole, string> = {
  OWNER: "Propriétaire",
  ADMIN: "Administrateur",
  SALES: "Commercial",
  OPERATIONS: "Planification",
  TECHNICIAN: "Technicien",
  SERVICE: "SAV",
  ACCOUNTING: "Comptabilité",
  VIEWER: "Lecture seule",
}

type TeamData = Awaited<ReturnType<typeof import("@/actions/team").getTeamOverview>>

export function TeamClient({ initialData }: { initialData: TeamData }) {
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<CompanyRole>("SALES")
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)

  function invite() {
    startTransition(async () => {
      const result = await createTeamInvitation({ email, role })
      if (!result?.success) {
        toast.error(result?.error ?? "Invitation impossible.")
        return
      }

      const url = `${window.location.origin}${result.invitationPath}`
      setInvitationUrl(url)
      setEmail("")
      toast.success("Invitation créée pour 7 jours.")
    })
  }

  function copyInvitation() {
    if (!invitationUrl) return
    void navigator.clipboard.writeText(invitationUrl).then(
      () => toast.success("Lien copié."),
      () => toast.error("Copie impossible. Sélectionnez le lien manuellement."),
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inviter un collaborateur</CardTitle>
          <CardDescription>Le lien est valable 7 jours et ne fonctionne qu'avec l'adresse indiquée.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px_auto] md:items-end">
            <div className="space-y-2">
              <Label htmlFor="team-email">Adresse professionnelle</Label>
              <Input
                id="team-email"
                type="email"
                autoComplete="email"
                placeholder="collaborateur@entreprise.fr"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Rôle</Label>
              <Select value={role} onValueChange={(value) => setRole(value as CompanyRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES
                    .filter((option) => initialData.actorRole === "OWNER" || option.value !== "ADMIN")
                    .map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={invite} disabled={isPending || !email.trim()}>
              <UserPlus />{isPending ? "Création…" : "Créer le lien"}
            </Button>
          </div>

          {invitationUrl ? (
            <div className="flex flex-col gap-3 rounded-xl bg-muted p-4 sm:flex-row sm:items-center">
              <Check className="size-5 shrink-0 text-success" />
              <code className="min-w-0 flex-1 break-all text-xs text-foreground">{invitationUrl}</code>
              <Button variant="outline" size="sm" onClick={copyInvitation}><Copy />Copier</Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <ShieldCheck className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Membres actifs</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{initialData.members.length} accès configuré{initialData.members.length > 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="divide-y divide-border">
          {initialData.members.map((member) => {
            const protectedRole = member.role === "OWNER" || member.role === "ADMIN"
            const actorCanEdit = initialData.actorRole === "OWNER" || !protectedRole
            return (
              <div key={member.id} className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:flex-wrap lg:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{member.user.name || member.user.email || "Utilisateur"}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{member.user.email}</p>
                </div>
                <Badge variant={member.status === "ACTIVE" ? "secondary" : "outline"}>{member.status === "ACTIVE" ? "Actif" : "Inactif"}</Badge>
                {actorCanEdit ? (
                  <Select
                    value={member.role}
                    disabled={isPending || member.status !== "ACTIVE"}
                    onValueChange={(value) => startTransition(async () => {
                      const result = await updateTeamMemberRole(member.id, value as CompanyRole)
                      if (result?.success) toast.success("Rôle mis à jour.")
                      else toast.error(result?.error ?? "Modification impossible.")
                    })}
                  >
                    <SelectTrigger className="w-full lg:w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {member.role === "OWNER" ? <SelectItem value="OWNER">Propriétaire</SelectItem> : null}
                      {ASSIGNABLE_ROLES
                        .filter((option) => initialData.actorRole === "OWNER" || option.value !== "ADMIN")
                        .map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="w-full text-sm text-muted-foreground lg:w-48">{ROLE_LABELS[member.role]}</span>
                )}
                <MemberWorkSettings memberId={member.id} minutes={member.weeklyCapacityMinutes} hourlyCostCents={member.hourlyCostCents} disabled={isPending || member.status !== "ACTIVE" || !actorCanEdit} onPending={(operation) => startTransition(operation)} />
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending || member.status !== "ACTIVE" || !actorCanEdit}
                  onClick={() => startTransition(async () => {
                    const result = await deactivateTeamMember(member.id)
                    if (result?.success) toast.success("Accès désactivé.")
                    else toast.error(result?.error ?? "Désactivation impossible.")
                  })}
                >
                  <UserMinus />Désactiver
                </Button>
                {["OWNER", "ADMIN", "SERVICE", "TECHNICIAN"].includes(member.role) ? <ServiceRoutingSettings member={member} disabled={isPending || member.status !== "ACTIVE" || !actorCanEdit} onPending={(operation) => startTransition(operation)} /> : null}
              </div>
            )
          })}
        </div>
      </section>

      {initialData.invitations.length ? (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Invitations en attente</h2>
          </div>
          <div className="divide-y divide-border">
            {initialData.invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{ROLE_LABELS[invitation.role]} · expire le {new Intl.DateTimeFormat("fr-FR").format(new Date(invitation.expiresAt))}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    const result = await cancelTeamInvitation(invitation.id)
                    if (result?.success) toast.success("Invitation annulée.")
                    else toast.error(result?.error ?? "Annulation impossible.")
                  })}
                >
                  <X />Annuler
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ServiceRoutingSettings({ member, disabled, onPending }: { member: TeamData["members"][number]; disabled: boolean; onPending: (operation: () => Promise<void>) => void }) {
  const [available, setAvailable] = useState(member.serviceAvailable)
  const [capacity, setCapacity] = useState(member.serviceTicketCapacity.toString())
  const [skills, setSkills] = useState(member.serviceSkills.join(", "))
  const [territories, setTerritories] = useState(member.serviceTerritories.join(", "))
  const list = (value: string) => [...new Set(value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean))]
  return (
    <details className="w-full rounded-lg border bg-muted/20">
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium"><Route className="size-4 text-primary" />Routage SAV <span className="text-xs font-normal text-muted-foreground">{available ? `${capacity} ticket(s) · ${list(skills).length} compétence(s)` : "indisponible"}</span></summary>
      <div className="grid gap-3 border-t p-3 md:grid-cols-[150px_150px_minmax(180px,1fr)_minmax(180px,1fr)_auto] md:items-end">
        <label className="flex h-10 items-center gap-2 rounded-lg border bg-background px-3 text-sm"><input type="checkbox" checked={available} disabled={disabled} onChange={(event) => setAvailable(event.target.checked)} />Disponible</label>
        <div className="space-y-1.5"><Label htmlFor={`service-capacity-${member.id}`}>Capacité tickets</Label><Input id={`service-capacity-${member.id}`} type="number" min="1" max="500" value={capacity} disabled={disabled} onChange={(event) => setCapacity(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor={`service-skills-${member.id}`}>Compétences</Label><Input id={`service-skills-${member.id}`} value={skills} disabled={disabled} onChange={(event) => setSkills(event.target.value)} placeholder="SAV, pompe, couverture" /></div>
        <div className="space-y-1.5"><Label htmlFor={`service-territories-${member.id}`}>Zones</Label><Input id={`service-territories-${member.id}`} value={territories} disabled={disabled} onChange={(event) => setTerritories(event.target.value)} placeholder="Nantes, Loire-Atlantique" /></div>
        <Button type="button" variant="outline" disabled={disabled || !capacity} onClick={() => onPending(async () => { const result = await updateTeamMemberServiceSettings(member.id, { available, ticketCapacity: Number(capacity), skills: list(skills), territories: list(territories) }); if (result?.success) toast.success("Routage SAV mis à jour."); else toast.error(result?.error || "Modification impossible.") })}><Save />Enregistrer</Button>
      </div>
    </details>
  )
}

function MemberWorkSettings({ memberId, minutes, hourlyCostCents, disabled, onPending }: { memberId: string; minutes: number; hourlyCostCents: number; disabled: boolean; onPending: (operation: () => Promise<void>) => void }) {
  const [hours, setHours] = useState((minutes / 60).toString())
  const [hourlyCost, setHourlyCost] = useState((hourlyCostCents / 100).toString())
  return (
    <div className="flex w-full items-center gap-1.5 lg:w-[290px]">
      <Clock3 className="size-4 shrink-0 text-muted-foreground" />
      <Input aria-label="Capacité hebdomadaire en heures" title="Capacité hebdomadaire" type="number" min="1" max="168" step="0.5" value={hours} disabled={disabled} onChange={(event) => setHours(event.target.value)} className="h-9 min-w-0" />
      <Euro className="ml-1 size-4 shrink-0 text-muted-foreground" />
      <Input aria-label="Coût horaire interne en euros" title="Coût horaire interne" type="number" min="0" max="10000" step="0.01" value={hourlyCost} disabled={disabled} onChange={(event) => setHourlyCost(event.target.value)} className="h-9 min-w-0" />
      <Button type="button" size="icon-sm" variant="ghost" title="Enregistrer capacité et coût" disabled={disabled || !hours || hourlyCost === ""} onClick={() => onPending(async () => { const result = await updateTeamMemberWorkSettings(memberId, Number(hours), Math.round(Number(hourlyCost) * 100)); if (result?.success) toast.success("Capacité et coût horaire mis à jour."); else toast.error(result?.error || "Modification impossible.") })}><Save /></Button>
    </div>
  )
}
