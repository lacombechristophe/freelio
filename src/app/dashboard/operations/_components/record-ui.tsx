import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function RecordHeader({
  backHref,
  eyebrow,
  title,
  description,
  actions,
}: {
  backHref: string;
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link href={backHref} />}
          aria-label="Retour"
        >
          <ArrowLeft />
        </Button>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            {eyebrow}
          </p>
          <h1 className="mt-1">{title}</h1>
          <div className="mt-2 text-sm text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function RecordMetric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="border-t p-5 first:border-t-0 sm:border-l sm:border-t-0 sm:first:border-l-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function DefinitionList({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="divide-y rounded-lg border">
      {items.map((item) => (
        <div
          key={item.label}
          className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[150px_minmax(0,1fr)]"
        >
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words font-medium">
            {item.value || "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyRecord({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function formatRecordDate(
  value: Date | string | null | undefined,
  withTime = false,
) {
  return value
    ? new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "medium",
        ...(withTime ? { timeStyle: "short" as const } : {}),
      }).format(new Date(value))
    : "—";
}

export function formatRecordMoney(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}
