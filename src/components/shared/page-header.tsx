import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: string
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={cn("flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between", className)}>
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function PageHeaderStat({
  label,
  value,
  detail,
}: {
  label: string
  value: ReactNode
  detail?: string
}) {
  return (
    <div className="min-w-36 border-l border-border pl-4">
      <p className="text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  )
}
