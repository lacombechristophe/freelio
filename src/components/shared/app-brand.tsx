"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"

import { cn } from "@/lib/utils"
import { initialGlyph } from "@/lib/initials"

export type WorkspaceBrand = {
  name: string
  logo?: string | null
  brandColor?: string | null
}

const DEFAULT_BRAND: WorkspaceBrand = { name: "Freelio", brandColor: "#1f4ed8" }

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
  inverted = false,
  className,
}: {
  brand?: WorkspaceBrand
  href?: string
  compact?: boolean
  inverted?: boolean
  className?: string
}) {
  const name = brand.name.trim() || DEFAULT_BRAND.name
  const color = safeColor(brand.brandColor)
  const logo = safeLogo(brand.logo)
  const [failedLogo, setFailedLogo] = useState<string | null>(null)

  return (
    <Link
      href={href}
      aria-label={name}
      className={cn(
        "inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className,
      )}
    >
      {logo && failedLogo !== logo && !compact ? (
        <Image
          src={logo}
          alt=""
          width={160}
          height={36}
          unoptimized
          className="h-9 w-40 max-w-[40vw] object-contain object-left"
          onError={() => setFailedLogo(logo)}
        />
      ) : (
        <>
          <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-[9px] text-sm font-semibold text-white" style={{ backgroundColor: color }}>
            {initialGlyph(name)}
          </span>
          {!compact ? <span className={cn("truncate text-sm font-semibold", inverted ? "text-white" : "text-inherit")}>{name}</span> : null}
        </>
      )}
    </Link>
  )
}
