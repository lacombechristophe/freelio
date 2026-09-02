import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarClock,
  FileCheck2,
  Mail,
  MapPin,
  Phone,
  ShieldAlert,
  UserRound,
  Wrench,
} from "lucide-react";

import { getServiceTicketDetail } from "@/actions/operations";
import { getRecordCrmProperties } from "@/actions/crm-properties";
import { RecordPropertiesPanel } from "@/components/crm/record-properties-panel";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TicketRecordActions } from "@/app/dashboard/operations/_components/record-actions";
import {
  DefinitionList,
  EmptyRecord,
  formatRecordDate,
  RecordHeader,
  RecordMetric,
} from "@/app/dashboard/operations/_components/record-ui";
import { ServiceConversationPanel } from "./service-conversation-panel";
import { ServiceDiagnosticPanel } from "./service-diagnostic-panel";
import { TicketDuplicateManager } from "./ticket-duplicate-manager";

const STATUS: Record<string, string> = {
  OPEN: "Ouvert",
  QUALIFIED: "Qualifié",
  PLANNED: "Planifié",
  WAITING: "En attente",
  RESOLVED: "Résolu",
  CLOSED: "Clos",
  MERGED: "Fusionné",
};
const PRIORITY: Record<string, string> = {
  LOW: "Faible",
  NORMAL: "Normale",
  HIGH: "Haute",
  URGENT: "Urgente",
};

export default async function ServiceTicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ticket, crmProperties] = await Promise.all([
    getServiceTicketDetail(id),
    getRecordCrmProperties("TICKET", id),
  ]);
  if (!ticket) notFound();
  const readOnly = ticket.status === "MERGED" || Boolean(ticket.mergedInto);
  const overdue = Boolean(
    ticket.dueAt &&
      ticket.dueAt < new Date() &&
      !["RESOLVED", "CLOSED", "MERGED"].includes(ticket.status),
  );
  const openReservations = ticket.interventions
    .flatMap((item) => item.reservations)
    .filter((item) => item.status !== "RESOLVED").length;

  return (
    <div className="workspace-page">
      <RecordHeader
        backHref="/dashboard/operations?tab=sav"
        eyebrow="Service client"
        title={`${ticket.number} · ${ticket.title}`}
        description={
          <>
            <Link
              href={`/dashboard/clients/${ticket.client.id}`}
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {ticket.client.name}
            </Link>{" "}
            · demande reçue le {formatRecordDate(ticket.requestedAt, true)}
          </>
        }
        actions={
          <>
            <Badge
              variant={ticket.priority === "URGENT" ? "destructive" : "outline"}
            >
              {PRIORITY[ticket.priority] || ticket.priority}
            </Badge>
            <Badge
              variant={ticket.status === "CLOSED" ? "secondary" : "outline"}
            >
              {STATUS[ticket.status] || ticket.status}
            </Badge>
          </>
        }
      />
      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-5">
        <RecordMetric
          icon={CalendarClock}
          label="Échéance"
          value={formatRecordDate(ticket.dueAt, true)}
          detail={readOnly ? "Dossier regroupé" : ticket.status === "WAITING" ? "Horloge suspendue" :
            overdue ? (
              <span className="text-destructive">Délai dépassé</span>
            ) : (
              "Engagement de traitement"
            )
          }
        />
        <RecordMetric
          icon={Mail}
          label="Première réponse"
          value={formatRecordDate(ticket.firstRespondedAt || (readOnly ? null : ticket.sla.firstResponse.targetAt), true)}
          detail={readOnly ? "Dossier regroupé" : ticket.firstRespondedAt ? "Réponse envoyée" : ticket.status === "WAITING" ? "Horloge suspendue" : ticket.sla.firstResponse.targetAt < new Date() ? <span className="text-destructive">Objectif dépassé</span> : "Objectif en heures ouvrées"}
        />
        <RecordMetric
          icon={UserRound}
          label="Responsable"
          value={
            ticket.assignedMembership?.user.name ||
            ticket.assignedMembership?.user.email ||
            "Non affecté"
          }
          detail="Propriétaire du ticket"
        />
        <RecordMetric
          icon={Wrench}
          label="Interventions"
          value={ticket.interventions.length}
          detail="Visites rattachées"
        />
        <RecordMetric
          icon={ShieldAlert}
          label="Réserves ouvertes"
          value={openReservations}
          detail="Reprises à suivre"
        />
      </section>
      {crmProperties ? (
        <RecordPropertiesPanel objectType="TICKET" recordId={ticket.id} data={crmProperties} />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <TicketDuplicateManager ticketId={ticket.id} ticketNumber={ticket.number} duplicateCandidates={ticket.duplicateCandidates} mergedTickets={ticket.mergedTickets} mergedInto={ticket.mergedInto} />
          <ServiceConversationPanel ticket={ticket} readOnly={readOnly} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Demande et matériel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-6">
                {ticket.description}
              </p>
              <DefinitionList
                items={[
                  { label: "Type", value: ticket.type },
                  { label: "Canal d’origine", value: ticket.source },
                  { label: "Site", value: ticket.site?.label },
                  {
                    label: "Équipement",
                    value: ticket.equipment ? (
                      <Link
                        href={`/dashboard/service/equipements/${ticket.equipment.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {ticket.equipment.label}
                      </Link>
                    ) : null,
                  },
                  {
                    label: "Dernière mise à jour",
                    value: formatRecordDate(ticket.updatedAt, true),
                  },
                ]}
              />
              {ticket.resolution && (
                <div className="rounded-lg border border-success/20 bg-success/5 p-4">
                  <p className="text-xs font-semibold text-success">
                    Résolution
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                    {ticket.resolution}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          <ServiceDiagnosticPanel ticket={ticket} readOnly={readOnly} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Interventions et preuves
              </CardTitle>
              <CardDescription>
                Planning, compte rendu, pièces et réserves du dossier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ticket.interventions.length ? (
                <div className="space-y-3">
                  {ticket.interventions.map((intervention) => (
                    <Link
                      key={intervention.id}
                      href={`/dashboard/service/interventions/${intervention.id}`}
                      className="block rounded-lg border p-4 transition-[background-color,border-color] hover:border-primary/30 hover:bg-muted/25"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {intervention.title}
                        </span>
                        <Badge
                          variant={
                            intervention.status === "COMPLETED"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {intervention.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRecordDate(intervention.scheduledStart, true)} ·{" "}
                        {intervention.assignedMembership?.user.name ||
                          intervention.assignedMembership?.user.email ||
                          "Non affectée"}
                      </p>
                      {intervention.mergedFrom && <p className="mt-1 text-[11px] text-primary">Historique regroupé depuis {intervention.mergedFrom.number}</p>}
                      <p className="mt-3 text-xs">
                        {intervention.report ||
                          "Compte rendu terrain à renseigner"}
                      </p>
                      <div className="mt-3 flex gap-3 text-xs text-muted-foreground">
                        <span>{intervention.files.length} pièce(s)</span>
                        <span>
                          {
                            intervention.reservations.filter(
                              (item) => item.status !== "RESOLVED",
                            ).length
                          }{" "}
                          réserve(s) ouverte(s)
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyRecord>
                  Aucune intervention planifiée pour ce ticket.
                </EmptyRecord>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          {!readOnly && <TicketRecordActions
            ticket={{
              id: ticket.id,
              status: ticket.status,
              priority: ticket.priority,
              assignedMembershipId: ticket.assignedMembershipId,
              dueAt: ticket.dueAt,
              resolution: ticket.resolution,
              requiredSkill: ticket.requiredSkill,
              territory: ticket.territory,
              routingReason: ticket.routingReason,
              members: ticket.members,
            }}
          />}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Client, site et contacts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {ticket.site && (
                <DefinitionList
                  items={[
                    { label: "Site", value: ticket.site.label },
                    {
                      label: "Adresse",
                      value: [
                        ticket.site.address1,
                        ticket.site.address2,
                        ticket.site.postalCode,
                        ticket.site.city,
                      ]
                        .filter(Boolean)
                        .join(" · "),
                    },
                    { label: "Accès", value: ticket.site.accessNotes },
                  ]}
                />
              )}
              {ticket.client.contacts.length ? (
                <div className="space-y-2">
                  {ticket.client.contacts.map((contact) => (
                    <div key={contact.id} className="rounded-lg border p-3">
                      <Link
                        href={`/dashboard/contacts/${contact.id}`}
                        className="text-sm font-semibold hover:text-primary hover:underline"
                      >
                        {contact.firstName} {contact.lastName}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {contact.role || "Contact"}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1 text-xs text-primary"
                          >
                            <Mail className="size-3" />
                            {contact.email}
                          </a>
                        )}
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="inline-flex items-center gap-1 text-xs text-primary"
                          >
                            <Phone className="size-3" />
                            {contact.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRecord>Aucun contact client renseigné.</EmptyRecord>
              )}
              {ticket.site && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([ticket.site.address1, ticket.site.postalCode, ticket.site.city].filter(Boolean).join(" "))}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <MapPin className="size-4" />
                  Ouvrir l’itinéraire
                </a>
              )}
            </CardContent>
          </Card>
          {ticket.closedAt && (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/35 p-4 text-sm">
              <FileCheck2 className="size-5 text-success" />
              <span>
                Dossier clos le {formatRecordDate(ticket.closedAt, true)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
