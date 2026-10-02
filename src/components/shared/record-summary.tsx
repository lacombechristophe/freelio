import type { ReactNode } from "react"

type SummaryItem = {
  label: string
  value: ReactNode
  detail?: ReactNode
}

/** Compact, readable facts shared by customer and commercial document records. */
export function RecordSummary({ label, items }: { label: string; items: SummaryItem[] }) {
  return (
    <dl aria-label={label} className="record-metrics grid grid-cols-2 overflow-hidden rounded-lg border bg-card sm:flex">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 flex-1 px-5 py-4 sm:border-l sm:first:border-l-0">
          <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
          <dd className="mt-1.5 break-words text-xl font-semibold tabular-nums">{item.value}</dd>
          {item.detail ? <dd className="mt-1 text-xs text-muted-foreground">{item.detail}</dd> : null}
        </div>
      ))}
    </dl>
  )
}
