import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** One command area, directly above the results, for all CRM directories. */
export function ListToolbar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("list-toolbar flex flex-wrap items-center gap-2", className)}>{children}</div>
}

export function ListScope({ count, loaded }: { count: number; loaded: number }) {
  return <p className="px-1 text-xs leading-5 text-muted-foreground" role="status">
    <span className="font-medium tabular-nums text-foreground">{count}</span> résultat{count === 1 ? "" : "s"}
    <span className="mx-2" aria-hidden="true">·</span>
    Recherche limitée à {loaded} élément{loaded === 1 ? "" : "s"} chargé{loaded === 1 ? "" : "s"}.
  </p>
}
