"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { AppBrand, type WorkspaceBrand } from "@/components/shared/app-brand"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DashboardNavigationMenu } from "./dashboard-navigation-menu"

export function Sidebar({ brand }: { brand: WorkspaceBrand }) {
  const [isCollapsed, setIsCollapsed] = React.useState(false)

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-[linear-gradient(180deg,#061f3f_0%,#061b35_62%,#05182f_100%)] transition-[width] duration-200 ease-out",
        isCollapsed ? "w-[72px]" : "w-[244px]"
      )}
    >
      <div className={cn("flex h-[60px] shrink-0 items-center border-b border-sidebar-border bg-white/[0.018]", isCollapsed ? "justify-center px-2" : "px-4")}>
        <AppBrand brand={brand} compact={isCollapsed} inverted />
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3 [scrollbar-color:rgba(255,255,255,0.18)_transparent]"><DashboardNavigationMenu collapsed={isCollapsed} /></div>

      <div className="border-t border-sidebar-border p-2.5">
        <Button
          variant="ghost"
          size="sm"
          className={cn("w-full text-sidebar-foreground/70 hover:bg-white/8 hover:text-white", isCollapsed ? "justify-center px-0" : "justify-start")}
          onClick={() => setIsCollapsed((value) => !value)}
          title={isCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}
          aria-label={isCollapsed ? "Agrandir la navigation" : "Réduire la navigation"}
        >
          {isCollapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          {!isCollapsed && <span>Réduire</span>}
        </Button>
      </div>
    </div>
  )
}
