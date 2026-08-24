import Link from "next/link"

import { cn } from "@/lib/utils"

export type WorkspaceBrand = {
  name: string
  logo?: string | null
  brandColor?: string | null
}

const DEFAULT_BRAND: WorkspaceBrand = { name: "CRM & opérations", brandColor: "#1f4ed8" }

function safeColor(value?: string | null) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_BRAND.brandColor!
}

function safeLogo(value?: string | null) {
  if (!value) return null
  if (value.startsWith("/") || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(value) || /^https:\/\//i.test(value)) return value
  return null
}

export function AppBrand({
  brand = DEFAULT_BRAND,
  href = "/dashboard",
  compact = false,
  className,
}: {
  brand?: WorkspaceBrand
  href?: string
  compact?: boolean
  className?: string
}) {
  const name = brand.name.trim() || DEFAULT_BRAND.name
  const color = safeColor(brand.brandColor)
  const logo = safeLogo(brand.logo)

  return (
    <Link
      href={href}
      aria-label={name}
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {logo && !compact ? (
        <span
          aria-hidden="true"
          className="h-9 w-40 max-w-[40vw] bg-contain bg-left bg-no-repeat"
          style={{ backgroundImage: `url(${JSON.stringify(logo)})` }}
        />
      ) : (
        <>
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[9px] text-sm font-semibold text-white" style={{ backgroundColor: color }}>
            {name.charAt(0).toUpperCase()}
          </span>
          {!compact ? <span className="truncate text-sm font-semibold text-foreground">{name}</span> : null}
        </>
      )}
    </Link>
  )
}
