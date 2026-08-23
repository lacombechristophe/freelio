"use client"

import * as React from "react"
import Link from "next/link"
import { Menu, X } from "lucide-react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dashboardNavigationSections } from "./sidebar"
import { DiskoovBrand } from "@/components/shared/diskoov-brand"

export function MobileSidebar() {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }

    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div className="lg:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Ouvrir la navigation"
        aria-expanded={open}
        aria-controls="mobile-dashboard-navigation"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </Button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Fermer la navigation"
            className="absolute inset-0 bg-foreground/30 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-dashboard-navigation"
            aria-label="Navigation principale"
            className="relative h-full w-[304px] max-w-[88vw] overscroll-contain border-r border-sidebar-border bg-sidebar shadow-[0_24px_60px_rgba(16,24,40,0.2)]"
          >
            <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
              <DiskoovBrand />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fermer la navigation"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </Button>
            </div>

            <div className="h-[calc(100dvh-4rem)] space-y-5 overflow-y-auto px-3 py-5">
              {dashboardNavigationSections.map((section) => (
                <div key={section.label}>
                  <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase text-muted-foreground">
                    {section.label}
                  </h2>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const active = item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname === item.href || pathname.startsWith(`${item.href}/`)

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition-colors",
                            active
                              ? "bg-accent text-accent-foreground"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          <item.icon aria-hidden="true" className={cn("h-5 w-5", active && "text-primary")} />
                          {item.name}
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  )
}
