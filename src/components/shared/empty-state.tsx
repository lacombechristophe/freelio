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
    <div data-slot="empty-state" className={cn("mx-auto flex max-w-md flex-col items-center whitespace-normal px-4 text-center", compact ? "py-8" : "py-10 sm:py-14", className)}>
      <span className="grid size-11 place-items-center rounded-xl border border-primary/15 bg-accent text-primary">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-[15px] font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
