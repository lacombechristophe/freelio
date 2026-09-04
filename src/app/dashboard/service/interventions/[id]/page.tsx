import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarDays,
  Clock3,
  FileCheck2,
  FileImage,
  FileText,
  MapPin,
  PackageMinus,
  ReceiptText,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { getFieldInterventionDetail } from "@/actions/operations";
import { InterventionRecordActions } from "@/app/dashboard/operations/_components/record-actions";
import {
  DefinitionList,
  EmptyRecord,
  formatRecordDate,
  formatRecordMoney,
  RecordHeader,
  RecordMetric,
} from "@/app/dashboard/operations/_components/record-ui";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATUS: Record<string, string> = {
  PLANNED: "Planifiée",
  EN_ROUTE: "En route",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELED: "Annulée",
};

export default async function InterventionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const intervention = await getFieldInterventionDetail((await params).id);
  if (!intervention) notFound();
  const materialCost = intervention.stockMovements.reduce(
    (sum, item) => sum + Math.abs(item.quantity) * (item.unitCostCents ?? 0),
    0,
  );
  const laborCost = Math.round(
    (intervention.laborMinutes *
      (intervention.assignedMembership?.hourlyCostCents ?? 0)) /
      60,
  );
  const expenseCost = intervention.expenses.reduce(
    (sum, item) => sum + item.amountCents,
    0,
  );
  const address = [
    intervention.site.address1,
    intervention.site.address2,
    intervention.site.postalCode,
    intervention.site.city,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="workspace-page">
      <RecordHeader
        backHref="/dashboard/operations?tab=planning"
        eyebrow="Exécution terrain"
        title={intervention.title}
        description={
          <>
            <Link
              href={`/dashboard/clients/${intervention.site.client.id}`}
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {intervention.site.client.name}
            </Link>{" "}
            · {intervention.site.label}
          </>
        }
        actions={
          <>
            {intervention.status === "COMPLETED" && (
              <a
                href={`/api/pdf/intervention/${intervention.id}`}
                target="_blank"
                rel="noreferrer"
                className={buttonVariants({ variant: "outline" })}
              >
                <FileText />
                Rapport PDF
              </a>
            )}
            <Badge
              variant={
                intervention.status === "COMPLETED" ? "secondary" : "outline"
              }
            >
              {STATUS[intervention.status] || intervention.status}
            </Badge>
          </>
        }
      />
      <InterventionRecordActions
        id={intervention.id}
        status={intervention.status}
      />
      <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <RecordMetric
          icon={CalendarDays}
          label="Début planifié"
          value={formatRecordDate(intervention.scheduledStart, true)}
          detail={
            intervention.scheduledEnd
              ? `Fin ${formatRecordDate(intervention.scheduledEnd, true)}`
              : "Durée non renseignée"
          }
        />
        <RecordMetric
          icon={Clock3}
          label="Temps réalisé"
          value={`${Math.round(intervention.laborMinutes / 6) / 10} h`}
          detail={
            intervention.startedAt
              ? `Démarrée ${formatRecordDate(intervention.startedAt, true)}`
              : "Non démarrée"
          }
        />
        <RecordMetric
          icon={UserRound}
          label="Intervenant"
          value={
            intervention.assignedMembership?.user.name ||
            intervention.assignedMembership?.user.email ||
            "Non affectée"
          }
          detail="Responsable terrain"
        />
        <RecordMetric
          icon={ReceiptText}
          label="Coût constaté"
          value={formatRecordMoney(materialCost + laborCost + expenseCost)}
          detail="Main-d’œuvre, matériel et frais"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ordre de mission</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: "Type", value: intervention.type },
                  {
                    label: "Ticket SAV",
                    value: intervention.ticket ? (
                      <Link
                        href={`/dashboard/service/tickets/${intervention.ticket.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {intervention.ticket.number} ·{" "}
                        {intervention.ticket.title}
                      </Link>
                    ) : null,
                  },
                  {
                    label: "Chantier",
                    value: intervention.project ? (
                      <Link
                        href={`/dashboard/projets/${intervention.project.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {intervention.project.name}
                      </Link>
                    ) : null,
                  },
                  {
                    label: "Contrat entretien",
                    value: intervention.maintenanceContract?.number,
                  },
                  { label: "Adresse", value: address },
                  {
                    label: "Consignes d’accès",
                    value: intervention.site.accessNotes,
                  },
                ]}
              />
              {address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                >
                  <MapPin className="size-4" />
                  Ouvrir l’itinéraire
                </a>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Compte rendu et accord client
              </CardTitle>
              <CardDescription>
                Preuve d’exécution conservée dans le dossier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {intervention.report ? (
                <div className="space-y-4">
                  <p className="whitespace-pre-wrap text-sm leading-6">
                    {intervention.report}
                  </p>
                  <DefinitionList
                    items={[
                      {
                        label: "Client présent",
                        value: intervention.customerName,
                      },
                      {
                        label: "Signature",
                        value: intervention.signedAt
                          ? `Signée le ${formatRecordDate(intervention.signedAt, true)}`
                          : null,
                      },
                      {
                        label: "Empreinte",
                        value: intervention.signatureSha256 ? (
                          <code className="break-all text-[10px]">
                            {intervention.signatureSha256}
                          </code>
                        ) : null,
                      },
                    ]}
                  />
                </div>
              ) : (
                <EmptyRecord>
                  Le compte rendu sera disponible après la clôture terrain
                  depuis la vue Planning.
                </EmptyRecord>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pièces et photos</CardTitle>
            </CardHeader>
            <CardContent>
              {intervention.files.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {intervention.files.map((file) => (
                    <a
                      key={file.id}
                      href={`/api/files/intervention/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-3 rounded-lg border p-3 hover:border-primary/30 hover:bg-muted/25"
                    >
                      {file.kind === "PHOTO" ? (
                        <FileImage className="size-4 text-primary" />
                      ) : (
                        <FileText className="size-4 text-primary" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {Math.max(1, Math.round(file.size / 1024))} Ko ·{" "}
                          {formatRecordDate(file.createdAt, true)}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <EmptyRecord>Aucune photo ou pièce jointe.</EmptyRecord>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Coûts réels</CardTitle>
              <CardDescription>
                Traçabilité de la marge opérationnelle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  {
                    label: "Main-d’œuvre",
                    value: formatRecordMoney(laborCost),
                  },
                  { label: "Matériel", value: formatRecordMoney(materialCost) },
                  { label: "Frais", value: formatRecordMoney(expenseCost) },
                  {
                    label: "Total",
                    value: formatRecordMoney(
                      laborCost + materialCost + expenseCost,
                    ),
                  },
                ]}
              />
              {intervention.stockMovements.length ? (
                <div className="mt-4 space-y-2">
                  {intervention.stockMovements.map((movement) => (
                    <div
                      key={movement.id}
                      className="flex justify-between gap-3 rounded-lg bg-muted/35 p-3 text-xs"
                    >
                      <span>
                        <PackageMinus className="mr-2 inline size-3.5" />
                        {Math.abs(movement.quantity)} × {movement.product.label}{" "}
                        · {movement.warehouse.name}
                      </span>
                      <strong>
                        {formatRecordMoney(
                          Math.abs(movement.quantity) *
                            (movement.unitCostCents ?? 0),
                        )}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Réserves et reprises</CardTitle>
            </CardHeader>
            <CardContent>
              {intervention.reservations.length ? (
                <div className="space-y-3">
                  {intervention.reservations.map((reservation) => (
                    <div key={reservation.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {reservation.title}
                        </span>
                        <Badge
                          variant={
                            reservation.status === "RESOLVED"
                              ? "secondary"
                              : reservation.severity === "BLOCKING"
                                ? "destructive"
                                : "outline"
                          }
                        >
                          {reservation.status === "RESOLVED"
                            ? "Résolue"
                            : reservation.severity}
                        </Badge>
                      </div>
                      {reservation.details && (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">
                          {reservation.details}
                        </p>
                      )}
                      {reservation.dueAt && (
                        <p className="mt-2 text-xs">
                          Échéance {formatRecordDate(reservation.dueAt)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-success/5 p-4 text-sm">
                  <ShieldCheck className="size-5 text-success" />
                  Aucune réserve enregistrée.
                </div>
              )}
            </CardContent>
          </Card>
          {intervention.completedAt && (
            <div className="flex items-center gap-3 rounded-xl border bg-muted/35 p-4 text-sm">
              <FileCheck2 className="size-5 text-success" />
              Terminée le {formatRecordDate(intervention.completedAt, true)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
