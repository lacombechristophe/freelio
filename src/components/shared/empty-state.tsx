import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <div className={cn("mx-auto flex max-w-md flex-col items-center text-center", compact ? "py-8" : "py-16 sm:py-20", className)}>
      <span className="grid size-11 place-items-center rounded-xl border border-primary/15 bg-accent text-primary shadow-[0_1px_2px_rgba(16,24,40,0.03)]">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
