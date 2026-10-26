"use client"

import Image from "next/image"
import { useState } from "react"
import { initialGlyph } from "@/lib/initials"

export function CompanyIdentity({ company, caption }: { company: { name: string; logo: string | null }; caption: string }) {
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  return <div className="flex min-w-0 basis-64 flex-1 items-center gap-3">
    {company.logo && failedLogo !== company.logo ? <Image
      src={company.logo} alt="" width={40} height={40} unoptimized
      className="size-10 shrink-0 rounded-xl border object-contain"
      onError={() => setFailedLogo(company.logo)}
    /> : <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{initialGlyph(company.name)}</span>}
    <div className="min-w-0">
      <p className="truncate font-semibold" title={company.name}>{company.name}</p>
      <p className="text-xs text-muted-foreground">{caption}</p>
    </div>
  </div>
}
