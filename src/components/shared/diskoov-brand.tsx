import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

export function DiskoovMark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[#14285a] font-heading text-sm font-semibold text-white", className)}>
      D
      <span className="absolute bottom-0 right-0 size-2.5 rounded-tl-md bg-[#ed6c22]" />
    </span>
  )
}

export function DiskoovBrand({
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
      aria-label="Diskoov"
      className={cn(
        "inline-flex min-h-11 items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {compact ? <DiskoovMark className="size-8" /> : <Image src="/diskoov-logo.png" alt="Diskoov" width={273} height={75} priority className="h-[30px] w-auto" />}
    </Link>
  )
}
