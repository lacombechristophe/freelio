"use client"

import type { ReactNode } from "react"
import { usePathname } from "next/navigation"

export function AppPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div key={pathname} className="app-page-enter">
      {children}
    </div>
  )
}
