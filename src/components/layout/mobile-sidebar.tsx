"use client"

import * as React from "react"
import Link from "next/link"
import { ChevronDown, Menu, X } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { dashboardHome, dashboardNavGroups, dashboardUtilityItems, navigationItemIsActive } from "./dashboard-navigation"
import { AppBrand, type WorkspaceBrand } from "@/components/shared/app-brand"

export function MobileSidebar({ brand }: { brand: WorkspaceBrand }) {
  const pathname = usePathname()
  const currentQuery = useSearchParams().toString()
  const [open, setOpen] = React.useState(false)
  const activeGroup = dashboardNavGroups.find((group) => group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery)))?.name
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : ["CRM"]))

  React.useEffect(() => {
    if (!activeGroup) return
    setOpenGroups((current) => current.has(activeGroup) ? current : new Set([...current, activeGroup]))
  }, [activeGroup])

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
              <AppBrand brand={brand} inverted />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fermer la navigation"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" className="h-5 w-5 text-white" />
              </Button>
            </div>

            <div className="h-[calc(100dvh-4rem)] space-y-1 overflow-y-auto px-3 py-4">
              <Link href={dashboardHome.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-3 rounded-[9px] px-3 text-sm font-semibold", pathname === dashboardHome.href ? "bg-sidebar-accent text-white" : "text-sidebar-foreground hover:bg-white/8 hover:text-white")}><dashboardHome.icon className="size-5" />{dashboardHome.name}</Link>
              <div className="pt-2">{dashboardNavGroups.map((group) => {
                const active = group.items.some((item) => navigationItemIsActive(pathname, item, currentQuery))
                const groupOpen = openGroups.has(group.name)
                return <section key={group.name} className="mb-1"><button type="button" onClick={() => setOpenGroups((current) => { const next = new Set(current); if (next.has(group.name)) next.delete(group.name); else next.add(group.name); return next })} aria-expanded={groupOpen} className={cn("flex h-9 w-full items-center gap-3 rounded-[9px] px-3 text-[11px] font-semibold uppercase", active ? "text-white" : "text-sidebar-foreground/65 hover:bg-white/7 hover:text-white")}><group.icon className={cn("size-4", active && "text-sidebar-primary")} /><span className="flex-1 text-left">{group.name}</span><ChevronDown className={cn("size-4 transition-transform", groupOpen && "rotate-180")} /></button>{groupOpen && <div className="py-1">{group.items.map((item) => { const itemActive = navigationItemIsActive(pathname, item, currentQuery); return <Link key={`${item.href}-${item.name}`} href={item.href} onClick={() => setOpen(false)} className={cn("flex min-h-9 items-center gap-2.5 rounded-lg px-3 py-2 text-sm", itemActive ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/85 hover:bg-white/7 hover:text-white")}><item.icon className="size-4 shrink-0" />{item.name}</Link> })}</div>}</section>
              })}</div>
              <div className="border-t border-sidebar-border pt-3">{dashboardUtilityItems.map((item) => <Link key={`${item.href}-${item.name}`} href={item.href} onClick={() => setOpen(false)} className={cn("flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm", navigationItemIsActive(pathname, item, currentQuery) ? "bg-sidebar-accent font-medium text-white" : "text-sidebar-foreground/85 hover:bg-white/7 hover:text-white")}><item.icon className="size-4" />{item.name}</Link>)}</div>
            </div>
          </nav>
        </div>
      ) : null}
    </div>
  )
}
