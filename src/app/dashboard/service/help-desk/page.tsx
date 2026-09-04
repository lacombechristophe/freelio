import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Headphones,
  ShieldAlert,
  SlidersHorizontal,
  Plus,
  UserRound,
  Wrench,
} from "lucide-react";

import { getHelpDeskDashboard } from "@/actions/operations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

const PRIORITY: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};
const STATUS: Record<string, string> = {
  OPEN: "Ouvert",
  QUALIFIED: "Qualifié",
  PLANNED: "Planifié",
  WAITING: "En attente",
  RESOLVED: "Résolu",
  CLOSED: "Clos",
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}
function queryHref(
  current: Record<string, string | undefined>,
  key: string,
  value: string,
) {
  const query = new URLSearchParams();
  for (const [name, item] of Object.entries({ ...current, [key]: value }))
    if (item && (item !== "ALL" || name === "status")) query.set(name, item);
  return `/dashboard/service/help-desk${query.size ? `?${query}` : ""}`;
}

export default async function HelpDeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const selected = {
    status: typeof raw.status === "string" ? raw.status : "ACTIVE",
    priority: typeof raw.priority === "string" ? raw.priority : "ALL",
    assignedMembershipId:
      typeof raw.assignedMembershipId === "string"
        ? raw.assignedMembershipId
        : "ALL",
  };
  const data = await getHelpDeskDashboard(selected);
  const now = new Date();
  const breached = data.tickets.filter(
    (ticket) =>
      ticket.targetAt < now && !["RESOLVED", "CLOSED"].includes(ticket.status),
  ).length;
  const urgent = data.tickets.filter(
    (ticket) =>
      ticket.priority === "URGENT" &&
      !["RESOLVED", "CLOSED"].includes(ticket.status),
  ).length;
  const firstResponseBreached = data.tickets.filter(
    (ticket) => !ticket.firstRespondedAt && ticket.firstResponseTargetAt < now && !["RESOLVED", "CLOSED"].includes(ticket.status),
  ).length;
  const unassigned = data.tickets.filter(
    (ticket) =>
      !ticket.assignedMembershipId &&
      !["RESOLVED", "CLOSED"].includes(ticket.status),
  ).length;

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Service client"
        title="Centre de support"
        description="Traitez les demandes prioritaires et suivez les engagements de réponse de votre équipe."
        actions={<Button nativeButton={false} render={<Link href="/dashboard/operations?tab=sav&create=1" />}><Plus />Nouveau ticket</Button>}
      />
      <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={ShieldAlert}
          label="Hors délai"
          value={breached}
          detail="À escalader maintenant"
          alert={breached > 0}
        />
        <Metric
          icon={AlertTriangle}
          label="1re réponse en retard"
          value={firstResponseBreached}
          detail={`${urgent} urgence(s) active(s)`}
          alert={firstResponseBreached > 0}
        />
        <Metric
          icon={UserRound}
          label="Non affectés"
          value={unassigned}
          detail="Sans propriétaire"
          alert={unassigned > 0}
        />
        <Metric
          icon={Wrench}
          label="En attente client"
          value={data.tickets.filter((ticket) => ticket.status === "WAITING").length}
          detail="Horloge SLA suspendue"
        />
      </section>
      <details className="group/filters rounded-xl border bg-card" open={selected.status !== "ACTIVE" || selected.priority !== "ALL" || selected.assignedMembershipId !== "ALL"}>
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          <span className="font-medium">Ajuster les filtres</span>
          <span className="text-xs text-muted-foreground">{selected.status === "ACTIVE" ? "Tickets actifs" : selected.status === "ALL" ? "Tous les statuts" : STATUS[selected.status]} · {selected.priority === "ALL" ? "Toutes les priorités" : PRIORITY[selected.priority]}</span>
          {selected.assignedMembershipId !== "ALL" && <Badge variant="secondary">Responsable filtré</Badge>}
          <ChevronDown className="ml-auto size-4 transition-transform group-open/filters:rotate-180" />
        </summary>
        <div className="space-y-4 border-t p-4">
          <FilterRow
            label="Statut"
            current={selected.status}
            values={[
              ["ACTIVE", "Actifs"],
              ["OPEN", "Ouverts"],
              ["QUALIFIED", "Qualifiés"],
              ["PLANNED", "Planifiés"],
              ["WAITING", "En attente"],
              ["RESOLVED", "Résolus"],
              ["CLOSED", "Clos"],
              ["ALL", "Tous"],
            ]}
            href={(value) => queryHref(selected, "status", value)}
          />
          <FilterRow
            label="Priorité"
            current={selected.priority}
            values={[
              ["ALL", "Toutes"],
              ["URGENT", "Urgente"],
              ["HIGH", "Haute"],
              ["NORMAL", "Normale"],
              ["LOW", "Faible"],
            ]}
            href={(value) => queryHref(selected, "priority", value)}
          />
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              Responsable
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterLink
                active={selected.assignedMembershipId === "ALL"}
                href={queryHref(selected, "assignedMembershipId", "ALL")}
              >
                Tous
              </FilterLink>
              <FilterLink
                active={selected.assignedMembershipId === "UNASSIGNED"}
                href={queryHref(selected, "assignedMembershipId", "UNASSIGNED")}
              >
                Non affectés
              </FilterLink>
              {data.members.map((member) => (
                <FilterLink
                  key={member.id}
                  active={selected.assignedMembershipId === member.id}
                  href={queryHref(selected, "assignedMembershipId", member.id)}
                >
                  {member.name} · {member.openTickets}/{member.capacity}{member.available ? "" : " · indisponible"}
                </FilterLink>
              ))}
            </div>
          </div>
          <p className="border-t pt-3 text-xs leading-5 text-muted-foreground">Les délais suivent les heures et jours ouverts de Paramètres → Service. Une échéance manuelle remplace l’objectif de résolution ; le statut En attente suspend les horloges.</p>
        </div>
      </details>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">File de traitement</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.tickets.length} ticket(s) correspondant aux filtres.
            </p>
          </div>
          <Badge variant="outline">Tri priorité · délai · ancienneté</Badge>
        </div>
        {data.tickets.length ? (
          <div className="divide-y">
            {data.tickets.map((ticket) => {
              const isClosed = ["RESOLVED", "CLOSED"].includes(ticket.status);
              const isBreached = !isClosed && ticket.targetAt < now;
              const firstResponseLate = !isClosed && !ticket.firstRespondedAt && ticket.firstResponseTargetAt < now;
              const warranty =
                ticket.equipment?.warrantyUntil &&
                ticket.equipment.warrantyUntil >= now;
              return (
                <Link
                  key={ticket.id}
                  href={`/dashboard/service/tickets/${ticket.id}`}
                  className="grid gap-4 px-5 py-4 transition-colors hover:bg-muted/30 lg:grid-cols-[minmax(0,1.2fr)_minmax(190px,0.65fr)_minmax(170px,0.55fr)] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs font-semibold">
                        {ticket.number}
                      </code>
                      <Badge
                        variant={
                          ticket.priority === "URGENT"
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {PRIORITY[ticket.priority] || ticket.priority}
                      </Badge>
                      <Badge
                        variant={
                          ticket.status === "CLOSED" ? "secondary" : "outline"
                        }
                      >
                        {STATUS[ticket.status] || ticket.status}
                      </Badge>
                      {warranty && (
                        <Badge variant="secondary">Sous garantie</Badge>
                      )}
                      {ticket.status === "WAITING" && <Badge variant="secondary">SLA suspendu</Badge>}
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold">
                      {ticket.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {ticket.client.name}
                      {ticket.site
                        ? ` · ${ticket.site.label}${ticket.site.city ? ` (${ticket.site.city})` : ""}`
                        : ""}
                      {ticket.equipment ? ` · ${ticket.equipment.label}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Responsable</p>
                    <p className="mt-1 text-sm font-medium">
                      {ticket.assignedMembership?.user.name ||
                        ticket.assignedMembership?.user.email ||
                        "Non affecté"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ticket._count.interventions} intervention(s)
                    </p>
                    <p className={`mt-1 text-xs ${firstResponseLate ? "text-destructive" : "text-muted-foreground"}`}>{ticket.firstRespondedAt ? `Réponse le ${formatDate(ticket.firstRespondedAt)}` : `1re réponse avant ${formatDate(ticket.firstResponseTargetAt)}`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Engagement de résolution
                    </p>
                    <p
                      className={`mt-1 text-sm font-semibold ${isBreached ? "text-destructive" : ""}`}
                    >
                      {formatDate(ticket.targetAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {isBreached
                        ? "Délai dépassé"
                        : ticket.slaSource === "CUSTOM"
                          ? "Échéance personnalisée"
                          : "Politique en heures ouvrées"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="grid place-items-center px-5 py-14 text-center">
            <CheckCircle2 className="mb-3 size-7 text-success" />
            <p className="text-sm font-semibold">
              Aucun ticket dans cette file
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Modifiez les filtres ou créez une demande depuis le centre
              opérationnel.
            </p>
          </div>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Advice icon={Headphones} title="Qualifier avant de planifier">
          Confirmez le symptôme, l’équipement, la garantie, l’accès au site et
          le résultat attendu.
        </Advice>
        <Advice icon={Clock3} title="Protéger le délai">
          Affectez chaque demande, fixez une échéance explicite et documentez le
          motif lorsqu’elle passe en attente.
        </Advice>
        <Advice icon={CalendarClock} title="Clore avec une preuve">
          Un ticket résolu doit contenir le diagnostic et l’action ;
          l’intervention conserve rapport, photos et signature.
        </Advice>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  alert = false,
}: {
  icon: typeof Wrench;
  label: string;
  value: number;
  detail: string;
  alert?: boolean;
}) {
  return (
    <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon
          className={`size-4 ${alert ? "text-destructive" : "text-primary"}`}
        />
        {label}
      </div>
      <p
        className={`mt-2 text-2xl font-semibold tabular-nums ${alert ? "text-destructive" : ""}`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
function FilterRow({
  label,
  current,
  values,
  href,
}: {
  label: string;
  current: string;
  values: string[][];
  href: (value: string) => string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-muted-foreground">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {values.map(([value, name]) => (
          <FilterLink key={value} active={current === value} href={href(value)}>
            {name}
          </FilterLink>
        ))}
      </div>
    </div>
  );
}
function FilterLink({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-[color,background-color,border-color] ${active ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:border-primary/35 hover:bg-muted"}`}
    >
      {children}
    </Link>
  );
}
function Advice({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Headphones;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <Icon className="size-5 text-primary" />
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}
