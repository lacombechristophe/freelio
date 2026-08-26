import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Boxes,
  Clock3,
  Mail,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import { getSupplierDetail } from "@/actions/operations";
import {
  DefinitionList,
  EmptyRecord,
  formatRecordDate,
  formatRecordMoney,
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

export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supplier = await getSupplierDetail((await params).id);
  if (!supplier) notFound();
  const spend = supplier.purchaseOrders
    .filter((order) => order.status !== "CANCELED")
    .reduce((sum, order) => sum + order.totalHtCents, 0);
  const received = supplier.purchaseOrders.filter((order) => order.receivedAt);
  const onTime = received.filter((order) => {
    const due = order.confirmedExpectedAt || order.expectedAt;
    return !due || order.receivedAt! <= due;
  }).length;
  const openIssues = supplier.purchaseOrders
    .flatMap((order) => order.issues)
    .filter((issue) => issue.status !== "RESOLVED").length;

  return (
    <div className="space-y-7">
      <RecordHeader
        backHref="/dashboard/operations?tab=stock"
        eyebrow="Approvisionnement"
        title={supplier.name}
        description={
          supplier.code
            ? `Code fournisseur ${supplier.code}`
            : "Fournisseur actif"
        }
        actions={
          <>
            {supplier.email && (
              <a
                href={`mailto:${supplier.email}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                <Mail className="size-4" />
                Écrire
              </a>
            )}
            <Badge variant={supplier.active ? "secondary" : "outline"}>
              {supplier.active ? "Actif" : "Inactif"}
            </Badge>
          </>
        }
      />
      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <RecordMetric
          icon={ReceiptText}
          label="Achats cumulés"
          value={formatRecordMoney(spend)}
          detail={`${supplier.purchaseOrders.length} commande(s)`}
        />
        <RecordMetric
          icon={Clock3}
          label="Ponctualité"
          value={
            received.length
              ? `${Math.round((onTime / received.length) * 100)} %`
              : "—"
          }
          detail={`${onTime}/${received.length} réception(s) à l’heure`}
        />
        <RecordMetric
          icon={ShieldCheck}
          label="Anomalies ouvertes"
          value={openIssues}
          detail="Non-conformités à traiter"
        />
        <RecordMetric
          icon={Boxes}
          label="Catalogue"
          value={supplier.products.length}
          detail="Références actives et archivées"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Coordonnées et conditions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <DefinitionList
                items={[
                  { label: "Contact", value: supplier.contactName },
                  {
                    label: "E-mail",
                    value: supplier.email ? (
                      <a
                        href={`mailto:${supplier.email}`}
                        className="hover:text-primary hover:underline"
                      >
                        {supplier.email}
                      </a>
                    ) : null,
                  },
                  {
                    label: "Téléphone",
                    value: supplier.phone ? (
                      <a
                        href={`tel:${supplier.phone}`}
                        className="hover:text-primary hover:underline"
                      >
                        {supplier.phone}
                      </a>
                    ) : null,
                  },
                  { label: "Adresse", value: supplier.address },
                  { label: "Paiement", value: supplier.paymentTerms },
                  {
                    label: "Délai habituel",
                    value:
                      supplier.deliveryDays != null
                        ? `${supplier.deliveryDays} jours`
                        : null,
                  },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Catalogue fournisseur</CardTitle>
              <CardDescription>
                Prix d’achat et disponibilité interne.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supplier.products.length ? (
                <div className="divide-y rounded-lg border">
                  {supplier.products.map((product) => {
                    const quantity = product.inventoryItems.reduce(
                      (sum, item) =>
                        sum + item.quantity - item.reservedQuantity,
                      0,
                    );
                    return (
                      <div
                        key={product.id}
                        className="flex items-center justify-between gap-3 p-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {product.sku} · {product.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {product.family || "Sans famille"} ·{" "}
                            {formatRecordMoney(product.purchasePriceCents)} HT
                          </span>
                        </span>
                        <Badge
                          variant={quantity <= 0 ? "destructive" : "outline"}
                        >
                          {quantity} dispo.
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyRecord>
                  Aucun produit rattaché à ce fournisseur.
                </EmptyRecord>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historique des commandes
              </CardTitle>
              <CardDescription>
                Montants, délais, reliquats et qualité fournisseur.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {supplier.purchaseOrders.length ? (
                <div className="space-y-3">
                  {supplier.purchaseOrders.map((order) => {
                    const remaining = order.lines.reduce(
                      (sum, line) =>
                        sum +
                        Math.max(
                          0,
                          line.quantity -
                            line.receivedQuantity -
                            line.creditedQuantity,
                        ),
                      0,
                    );
                    return (
                      <Link
                        key={order.id}
                        href={`/dashboard/operations/achats/${order.id}`}
                        className="block rounded-lg border p-4 hover:border-primary/30 hover:bg-muted/25"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold">
                            {order.number}
                          </span>
                          <Badge
                            variant={
                              order.issues.some(
                                (issue) => issue.status !== "RESOLVED",
                              )
                                ? "destructive"
                                : order.status === "RECEIVED"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {order.status}
                          </Badge>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">
                              {order.project?.name ||
                                "Approvisionnement général"}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Commandée le {formatRecordDate(order.orderDate)} ·{" "}
                              {remaining} unité(s) en reliquat
                            </p>
                          </div>
                          <strong className="tabular-nums">
                            {formatRecordMoney(order.totalHtCents)}
                          </strong>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <EmptyRecord>Aucune commande fournisseur.</EmptyRecord>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retours et avoirs</CardTitle>
            </CardHeader>
            <CardContent>
              {supplier.supplierReturns.length ? (
                <div className="space-y-3">
                  {supplier.supplierReturns.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          <RotateCcw className="mr-2 inline size-4" />
                          {item.number}
                        </span>
                        <Badge
                          variant={
                            item.status === "CREDITED" ? "secondary" : "outline"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.quantity} × {item.product.sku} ·{" "}
                        {item.product.label} · {item.warehouse.name}
                      </p>
                      <p className="mt-2 text-xs">
                        {item.reason}
                        {item.creditReference
                          ? ` · Avoir ${item.creditReference}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-success/5 p-4 text-sm">
                  <PackageCheck className="size-5 text-success" />
                  Aucun retour fournisseur.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
