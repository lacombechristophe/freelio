import { SupplierProductHistory, SupplierOrderHistory, SupplierReturnHistory } from "../supplier-history";
import { SupplierActions } from "../supplier-actions";
import { notFound } from "next/navigation";
import {
  Boxes,
  Clock3,
  Mail,
  ReceiptText,
  ShieldCheck,
} from "lucide-react";

import { getSupplierDetail } from "@/actions/operations";
import {
  DefinitionList,
  formatRecordMoney,
  RecordHeader,
  RecordMetric,
} from "@/app/dashboard/operations/_components/record-ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
  const { spend, orderCount, receivedCount, onTimeCount, openIssues, productCount } = supplier.metrics;

  return (
    <div className="workspace-page">
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
            <SupplierActions canManage={supplier.canManage} supplier={{ id: supplier.id, name: supplier.name, code: supplier.code, contactName: supplier.contactName, email: supplier.email, phone: supplier.phone, address: supplier.address, paymentTerms: supplier.paymentTerms, deliveryDays: supplier.deliveryDays, active: supplier.active, updatedAt: supplier.updatedAt.toISOString() }} />
            <Badge variant={supplier.active ? "secondary" : "outline"}>
              {supplier.active ? "Actif" : "Inactif"}
            </Badge>
          </>
        }
      />
      <section className="record-metrics grid grid-cols-2 overflow-hidden rounded-xl border bg-card sm:grid-cols-2 xl:grid-cols-4">
        <RecordMetric
          icon={ReceiptText}
          label="Achats cumulés"
          value={formatRecordMoney(spend)}
          detail={`${orderCount} commande(s)`}
        />
        <RecordMetric
          icon={Clock3}
          label="Ponctualité"
          value={
            receivedCount
              ? `${Math.round((onTimeCount / receivedCount) * 100)} %`
              : "—"
          }
          detail={`${onTimeCount}/${receivedCount} réception(s) à l’heure`}
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
          value={productCount}
          detail="Références actives et archivées"
        />
      </section>
      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="min-w-0 space-y-6">
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
          <SupplierProductHistory supplierId={supplier.id} initial={supplier.products} />
        </div>
        <div className="min-w-0 space-y-6">
          <SupplierOrderHistory supplierId={supplier.id} initial={supplier.purchaseOrders} />
          <SupplierReturnHistory supplierId={supplier.id} initial={supplier.supplierReturns} />
        </div>
      </div>
    </div>
  );
}
