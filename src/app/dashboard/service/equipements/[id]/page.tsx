import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CalendarCheck2,
  CircleGauge,
  Factory,
  History,
  MapPin,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { getEquipmentDetail } from "@/actions/operations";
import { getRecordCrmProperties } from "@/actions/crm-properties";
import { RecordPropertiesPanel } from "@/components/crm/record-properties-panel";
import {
  DefinitionList,
  EmptyRecord,
  formatRecordDate,
  RecordHeader,
  RecordMetric,
} from "@/app/dashboard/operations/_components/record-ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [equipment, crmProperties] = await Promise.all([
    getEquipmentDetail(id),
    getRecordCrmProperties("EQUIPMENT", id),
  ]);
  if (!equipment) notFound();
  const openTickets = equipment.tickets.filter(
    (ticket) => !["RESOLVED", "CLOSED", "MERGED"].includes(ticket.status),
  ).length;
  const warrantyActive = Boolean(
    equipment.warrantyUntil && equipment.warrantyUntil >= new Date(),
  );
  const address = [
    equipment.site.address1,
    equipment.site.address2,
    equipment.site.postalCode,
    equipment.site.city,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-7">
      <RecordHeader
        backHref="/dashboard/operations?tab=assets"
        eyebrow="Parc installé"
        title={equipment.label}
        description={
          <>
            <Link
              href={`/dashboard/clients/${equipment.site.client.id}`}
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {equipment.site.client.name}
            </Link>{" "}
            · {equipment.site.label}
          </>
        }
        actions={
          <Badge
            variant={equipment.status === "ACTIVE" ? "secondary" : "outline"}
          >
            {equipment.status}
          </Badge>
        }
      />
      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <RecordMetric
          icon={Factory}
          label="Fabricant"
          value={
            equipment.manufacturer || equipment.product?.manufacturer || "—"
          }
          detail={equipment.model || "Modèle non renseigné"}
        />
        <RecordMetric
          icon={CalendarCheck2}
          label="Installation"
          value={formatRecordDate(equipment.installedAt)}
          detail="Mise en service"
        />
        <RecordMetric
          icon={ShieldCheck}
          label="Garantie"
          value={formatRecordDate(equipment.warrantyUntil)}
          detail={
            warrantyActive ? (
              <span className="text-success">Garantie active</span>
            ) : equipment.warrantyUntil ? (
              "Garantie expirée"
            ) : (
              "Échéance non renseignée"
            )
          }
        />
        <RecordMetric
          icon={Wrench}
          label="SAV ouverts"
          value={openTickets}
          detail={`${equipment.tickets.length} ticket(s) au total`}
        />
      </section>
      {crmProperties ? (
        <RecordPropertiesPanel objectType="EQUIPMENT" recordId={equipment.id} data={crmProperties} />
      ) : null}
      <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Fiche technique</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DefinitionList
                items={[
                  { label: "Catégorie", value: equipment.category },
                  { label: "Fabricant", value: equipment.manufacturer },
                  { label: "Modèle", value: equipment.model },
                  {
                    label: "Numéro de série",
                    value: equipment.serialNumber ? (
                      <code className="text-xs">{equipment.serialNumber}</code>
                    ) : null,
                  },
                  {
                    label: "Produit catalogue",
                    value: equipment.product
                      ? `${equipment.product.sku} · ${equipment.product.label}`
                      : null,
                  },
                  {
                    label: "Fournisseur",
                    value: equipment.product?.supplier ? (
                      <Link
                        href={`/dashboard/operations/fournisseurs/${equipment.product.supplier.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {equipment.product.supplier.name}
                      </Link>
                    ) : null,
                  },
                ]}
              />
              {equipment.notes && (
                <p className="rounded-lg bg-muted/40 p-3 text-sm leading-6">
                  {equipment.notes}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Site d’installation</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  { label: "Site", value: equipment.site.label },
                  { label: "Type", value: equipment.site.kind },
                  { label: "Adresse", value: address },
                  { label: "Accès", value: equipment.site.accessNotes },
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
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historique SAV</CardTitle>
              <CardDescription>
                Incidents, affectations et interventions associés à cet
                équipement.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {equipment.tickets.length ? (
                <div className="space-y-3">
                  {equipment.tickets.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/dashboard/service/tickets/${ticket.id}`}
                      className="block rounded-lg border p-4 hover:border-primary/30 hover:bg-muted/25"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {ticket.number} · {ticket.title}
                        </span>
                        <Badge
                          variant={
                            ticket.priority === "URGENT"
                              ? "destructive"
                              : ticket.status === "CLOSED"
                                ? "secondary"
                                : "outline"
                          }
                        >
                          {ticket.status === "MERGED" ? "Fusionné" : ticket.status}
                        </Badge>
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
                        {ticket.description}
                      </p>
                      <p className="mt-2 text-xs">
                        {formatRecordDate(ticket.requestedAt, true)} ·{" "}
                        {ticket.assignedMembership?.user.name ||
                          ticket.assignedMembership?.user.email ||
                          "Non affecté"}{" "}
                        · {ticket._count.interventions} intervention(s)
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyRecord>
                  Aucun incident : le cycle de vie de l’équipement est vierge.
                </EmptyRecord>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Contrats d’entretien
                  </CardTitle>
                  <CardDescription>
                    Couverture préventive rattachée.
                  </CardDescription>
                </div>
                <History className="size-4 text-primary" />
              </div>
            </CardHeader>
            <CardContent>
              {equipment.maintenanceContracts.length ? (
                <div className="space-y-3">
                  {equipment.maintenanceContracts.map(({ contract }) => (
                    <div key={contract.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">
                          {contract.number} · {contract.label}
                        </span>
                        <Badge variant="outline">{contract.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {contract.frequency} · prochaine visite{" "}
                        {formatRecordDate(contract.nextVisitAt)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-muted/35 p-4 text-sm text-muted-foreground">
                  <CircleGauge className="size-5" />
                  Aucun contrat d’entretien rattaché.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
