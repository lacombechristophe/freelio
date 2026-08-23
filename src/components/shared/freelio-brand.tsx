import Link from "next/link"

import { cn } from "@/lib/utils"

export function FreelioMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative block size-8 shrink-0", className)}>
      <span className="absolute left-[14%] top-[8%] h-[32%] w-[62%] skew-y-[-24deg] rounded-[2px] bg-primary" />
      <span className="absolute left-[14%] top-[36%] h-[28%] w-[48%] skew-y-[-24deg] rounded-[2px] bg-primary" />
      <span className="absolute bottom-[5%] left-[14%] h-[44%] w-[24%] skew-y-[-24deg] rounded-[2px] bg-primary" />
    </span>
  )
}

export function FreelioBrand({
  href = "/dashboard",
  compact = false,
  className,
}: {
  href?: string
  compact?: boolean
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="Freelio"
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      <FreelioMark className="size-7" />
      {!compact && <span className="font-heading text-lg font-semibold text-foreground">Freelio</span>}
    </Link>
  )
}
