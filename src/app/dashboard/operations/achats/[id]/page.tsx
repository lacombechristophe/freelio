import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  FileText,
  PackageCheck,
  ReceiptText,
  RotateCcw,
} from "lucide-react";

import { getPurchaseOrderDetail } from "@/actions/operations";
import { PurchaseOrderRecordActions } from "@/app/dashboard/operations/_components/record-actions";
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
  DRAFT: "Brouillon",
  PENDING_APPROVAL: "À approuver",
  APPROVED: "Approuvée",
  SENT: "Envoyée",
  ACKNOWLEDGED: "Accusée",
  PARTIALLY_RECEIVED: "Réception partielle",
  RECEIVED: "Réceptionnée",
  RECEIVED_WITH_ISSUES: "Reçue avec anomalies",
  CANCELED: "Annulée",
};
const ISSUE: Record<string, string> = {
  DAMAGED: "Endommagé",
  MISSING: "Manquant",
  WRONG_ITEM: "Mauvaise référence",
  QUALITY: "Non-conforme",
  OTHER: "Autre",
};

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const order = await getPurchaseOrderDetail((await params).id);
  if (!order) notFound();
  const ordered = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  const received = order.lines.reduce(
    (sum, line) => sum + line.receivedQuantity,
    0,
  );
  const remaining = order.lines.reduce(
    (sum, line) =>
      sum +
      Math.max(
        0,
        line.quantity - line.receivedQuantity - line.creditedQuantity,
      ),
    0,
  );
  const due = order.confirmedExpectedAt || order.expectedAt;
  const overdue = Boolean(
    due && due < new Date() && remaining > 0 && order.status !== "CANCELED",
  );

  return (
    <div className="space-y-7">
      <RecordHeader
        backHref="/dashboard/operations?tab=stock"
        eyebrow="Commande fournisseur"
        title={order.number}
        description={
          <>
            <Link
              href={`/dashboard/operations/fournisseurs/${order.supplier.id}`}
              className="font-medium text-foreground hover:text-primary hover:underline"
            >
              {order.supplier.name}
            </Link>
            {order.project ? (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/dashboard/projets/${order.project.id}`}
                  className="hover:text-primary hover:underline"
                >
                  {order.project.name}
                </Link>
              </>
            ) : (
              " · Approvisionnement général"
            )}
          </>
        }
        actions={
          <>
            <a
              href={`/api/pdf/achat/${order.id}`}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "outline" })}
            >
              <FileText />
              PDF
            </a>
            <Badge
              variant={
                overdue || order.status === "RECEIVED_WITH_ISSUES"
                  ? "destructive"
                  : order.status === "RECEIVED"
                    ? "secondary"
                    : "outline"
              }
            >
              {STATUS[order.status] || order.status}
            </Badge>
          </>
        }
      />
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <PurchaseOrderRecordActions
          id={order.id}
          status={order.status}
          canApprove={order.canApprovePurchases}
        />
        <Link
          href="/dashboard/operations?tab=stock"
          className="text-sm font-medium text-primary hover:underline"
        >
          Ouvrir le workflow de réception →
        </Link>
      </div>
      <section className="grid overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <RecordMetric
          icon={ReceiptText}
          label="Total HT"
          value={formatRecordMoney(order.totalHtCents)}
          detail={`${order.lines.length} ligne(s)`}
        />
        <RecordMetric
          icon={PackageCheck}
          label="Réception"
          value={`${received}/${ordered}`}
          detail={`${remaining} unité(s) en reliquat`}
        />
        <RecordMetric
          icon={CalendarClock}
          label="Date attendue"
          value={formatRecordDate(due)}
          detail={
            overdue ? (
              <span className="text-destructive">Livraison en retard</span>
            ) : order.confirmedExpectedAt ? (
              "Confirmée par le fournisseur"
            ) : (
              "Date demandée"
            )
          }
        />
        <RecordMetric
          icon={AlertTriangle}
          label="Anomalies"
          value={
            order.issues.filter((issue) => issue.status !== "RESOLVED").length
          }
          detail={`${order.issues.length} au total`}
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lignes commandées</CardTitle>
              <CardDescription>
                Commandé, reçu, crédité et valeur résiduelle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="border-b bg-muted/35 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Référence</th>
                      <th className="px-3 py-2 font-medium">Désignation</th>
                      <th className="px-3 py-2 text-right font-medium">
                        Commandé
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Reçu</th>
                      <th className="px-3 py-2 text-right font-medium">
                        PU HT
                      </th>
                      <th className="px-3 py-2 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-3 py-3 font-mono text-xs">
                          {line.product?.sku || "—"}
                        </td>
                        <td className="px-3 py-3 font-medium">{line.label}</td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {line.quantity}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {line.receivedQuantity}
                          {line.creditedQuantity
                            ? ` (${line.creditedQuantity} créditée)`
                            : ""}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {formatRecordMoney(line.unitPriceCents)}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                          {formatRecordMoney(
                            line.quantity * line.unitPriceCents,
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Réceptions</CardTitle>
              <CardDescription>
                Bons fournisseurs, dépôts et contrôles qualité.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {order.goodsReceipts.length ? (
                <div className="space-y-3">
                  {order.goodsReceipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">
                          {receipt.number}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatRecordDate(receipt.receivedAt, true)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium">
                        {receipt.warehouse.name}
                        {receipt.supplierReference
                          ? ` · Bon ${receipt.supplierReference}`
                          : ""}
                      </p>
                      <div className="mt-3 space-y-2">
                        {receipt.lines.map((line) => (
                          <div
                            key={line.id}
                            className="flex justify-between gap-3 rounded-md bg-muted/35 px-3 py-2 text-xs"
                          >
                            <span>
                              {line.product?.label || "Ligne sans produit"}
                            </span>
                            <span>
                              {line.acceptedQuantity} acceptée(s)
                              {line.rejectedQuantity
                                ? ` · ${line.rejectedQuantity} rejetée(s)`
                                : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRecord>Aucune réception enregistrée.</EmptyRecord>
              )}
            </CardContent>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cycle d’approbation</CardTitle>
            </CardHeader>
            <CardContent>
              <DefinitionList
                items={[
                  {
                    label: "Créée",
                    value: formatRecordDate(order.createdAt, true),
                  },
                  {
                    label: "Soumise",
                    value: formatRecordDate(order.submittedAt, true),
                  },
                  {
                    label: "Approuvée",
                    value: order.approvedAt
                      ? `${formatRecordDate(order.approvedAt, true)} · ${order.approvedByMembership?.user.name || order.approvedByMembership?.user.email || "Utilisateur"}`
                      : null,
                  },
                  {
                    label: "Envoyée",
                    value: formatRecordDate(order.sentAt, true),
                  },
                  {
                    label: "Accusée",
                    value: formatRecordDate(order.acknowledgedAt, true),
                  },
                  { label: "Référence", value: order.supplierReference },
                  {
                    label: "Reçue",
                    value: formatRecordDate(order.receivedAt, true),
                  },
                ]}
              />
              {order.notes && (
                <p className="mt-4 rounded-lg bg-muted/35 p-3 text-sm leading-6">
                  {order.notes}
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Anomalies qualité</CardTitle>
            </CardHeader>
            <CardContent>
              {order.issues.length ? (
                <div className="space-y-3">
                  {order.issues.map((issue) => (
                    <div key={issue.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">
                          {ISSUE[issue.type] || issue.type} ·{" "}
                          {issue.purchaseOrderLine.label}
                        </span>
                        <Badge
                          variant={
                            issue.status === "RESOLVED"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {issue.status}
                        </Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {issue.quantity} unité(s) ·{" "}
                        {formatRecordDate(issue.createdAt, true)}
                      </p>
                      {issue.notes && (
                        <p className="mt-2 text-xs">{issue.notes}</p>
                      )}
                      {issue.resolution && (
                        <p className="mt-2 rounded-md bg-success/5 p-2 text-xs">
                          Résolution : {issue.resolution}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg bg-success/5 p-4 text-sm">
                  <CheckCircle2 className="size-5 text-success" />
                  Aucune anomalie de réception.
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Retours fournisseur</CardTitle>
            </CardHeader>
            <CardContent>
              {order.supplierReturns.length ? (
                <div className="space-y-3">
                  {order.supplierReturns.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">
                          <RotateCcw className="mr-2 inline size-4" />
                          {item.number}
                        </span>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                      <p className="mt-2 text-xs">
                        {item.quantity} × {item.product.label} ·{" "}
                        {item.warehouse.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.reason}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRecord>Aucun retour associé.</EmptyRecord>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
