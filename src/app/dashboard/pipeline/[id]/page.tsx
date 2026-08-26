import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  Mail,
  Phone,
  Target,
  UserRound,
} from "lucide-react";

import { getOpportunityDetail } from "@/actions/pipeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OpportunityActions } from "./opportunity-actions";

const TYPE_LABELS: Record<string, string> = {
  NOTE: "Note",
  CALL: "Appel",
  EMAIL: "E-mail",
  MEETING: "Rendez-vous",
};

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
function date(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        timeStyle: value.includes("T") ? "short" : undefined,
        timeZone: value.endsWith("Z") ? "Europe/Paris" : "UTC",
      }).format(
        new Date(value.includes("T") ? value : `${value}T12:00:00.000Z`),
      )
    : "—";
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const opportunity = await getOpportunityDetail((await params).id);
  if (!opportunity) notFound();
  const latestVersion = (quote: (typeof opportunity.client.quotes)[number]) =>
    quote.versions[0];
  const stageLabel =
    opportunity.status === "LOST"
      ? "Perdue"
      : opportunity.stages.find((stage) => stage.id === opportunity.status)
          ?.title || opportunity.status;

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            nativeButton={false}
            render={<Link href="/dashboard/pipeline" />}
            aria-label="Retour au pipeline"
          >
            <ArrowLeft />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1>{opportunity.title}</h1>
              <Badge
                variant={
                  opportunity.status === "LOST"
                    ? "destructive"
                    : opportunity.status === "WON"
                      ? "secondary"
                      : "outline"
                }
              >
                {stageLabel}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link
                href={`/dashboard/clients/${opportunity.client.id}`}
                className="font-medium text-foreground hover:text-primary hover:underline"
              >
                {opportunity.client.name}
              </Link>{" "}
              · mis à jour le {date(opportunity.updatedAt)}
            </p>
          </div>
        </div>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href={`/dashboard/clients/${opportunity.client.id}`} />}
        >
          <UserRound />
          Ouvrir le client
        </Button>
      </header>

      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={CircleDollarSign}
          label="Montant"
          value={money(opportunity.valueCents)}
          detail="Valeur non pondérée"
        />
        <Metric
          icon={Target}
          label="Prévision"
          value={money(
            Math.round(
              (opportunity.valueCents * opportunity.probability) / 100,
            ),
          )}
          detail={`${opportunity.probability} % de probabilité`}
        />
        <Metric
          icon={CalendarDays}
          label="Clôture prévue"
          value={date(opportunity.closeDate)}
          detail={
            opportunity.closedAt
              ? `Clôturée le ${date(opportunity.closedAt)}`
              : "À confirmer régulièrement"
          }
        />
        <Metric
          icon={UserRound}
          label="Responsable"
          value={
            opportunity.ownerMembership?.user.name ||
            opportunity.ownerMembership?.user.email ||
            opportunity.ownerLabel ||
            "Non attribuée"
          }
          detail="Propriétaire commercial"
        />
      </section>

      {opportunity.status === "LOST" && opportunity.lostReason ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <p className="text-xs font-semibold text-destructive">
            Motif de perte
          </p>
          <p className="mt-1 text-sm">{opportunity.lostReason}</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Chronologie commerciale
              </CardTitle>
              <CardDescription>
                Appels, rendez-vous, e-mails et notes associés à cette
                opportunité.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {opportunity.activities.length ? (
                <div className="space-y-3">
                  {opportunity.activities.map((activity) => (
                    <article
                      key={activity.id}
                      className="rounded-lg border p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Badge variant="outline">
                          {TYPE_LABELS[activity.type] || activity.type}
                        </Badge>
                        <time className="text-xs text-muted-foreground">
                          {date(activity.createdAt)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                        {activity.content}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                  Aucune activité consignée. Ajoutez le prochain échange pour
                  fiabiliser la relance.
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Devis et chantiers du client
              </CardTitle>
              <CardDescription>
                Contexte commercial et opérationnel lié au même compte.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Devis récents
                </p>
                {opportunity.client.quotes.length ? (
                  <div className="divide-y rounded-lg border">
                    {opportunity.client.quotes.map((quote) => (
                      <Link
                        key={quote.id}
                        href={`/dashboard/devis/${quote.id}`}
                        className="flex items-center gap-3 p-3 hover:bg-muted/35"
                      >
                        <BriefcaseBusiness className="size-4 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {quote.number} · {quote.object}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {quote.status} ·{" "}
                            {latestVersion(quote)
                              ? money(latestVersion(quote)!.totalTtcCents)
                              : "Montant à calculer"}
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun devis pour ce client.
                  </p>
                )}
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Chantiers
                </p>
                {opportunity.client.projects.length ? (
                  <div className="divide-y rounded-lg border">
                    {opportunity.client.projects.map((project) => (
                      <Link
                        key={project.id}
                        href={`/dashboard/projets/${project.id}`}
                        className="flex items-center justify-between gap-3 p-3 hover:bg-muted/35"
                      >
                        <span>
                          <span className="block text-sm font-medium">
                            {project.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {project.status}
                            {project.worksiteStage
                              ? ` · ${project.worksiteStage}`
                              : ""}
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 text-muted-foreground" />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Aucun chantier rattaché.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <OpportunityActions
            opportunityId={opportunity.id}
            status={opportunity.status}
            probability={opportunity.probability}
            ownerMembershipId={opportunity.ownerMembershipId}
            closeDate={opportunity.closeDate}
            lostReason={opportunity.lostReason}
            stages={opportunity.stages}
            members={opportunity.members}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interlocuteurs</CardTitle>
            </CardHeader>
            <CardContent>
              {opportunity.client.contacts.length ? (
                <div className="space-y-3">
                  {opportunity.client.contacts.map((contact) => (
                    <div key={contact.id} className="rounded-lg border p-3">
                      <Link
                        href={`/dashboard/contacts/${contact.id}`}
                        className="text-sm font-semibold hover:text-primary hover:underline"
                      >
                        {contact.firstName} {contact.lastName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contact.role || "Fonction non renseignée"}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Mail className="size-3.5" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            <Phone className="size-3.5" />
                            {contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Aucun interlocuteur renseigné.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Target;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
