import * as React from "react"
import Link from "next/link"
import { CalendarDays, CircleHelp } from "lucide-react"
import { auth } from "@/auth"
import { Sidebar } from "./sidebar"
import { GlobalSearch } from "./global-search"
import { NotificationBell } from "./notification-bell"
import { ThemeToggle } from "./theme-toggle"
import { UserMenu } from "./user-menu"
import { MobileSidebar } from "./mobile-sidebar"
import { getNotifications, getUnreadCount } from "@/actions/notifications"
import { AppBrand, type WorkspaceBrand } from "@/components/shared/app-brand"
import { AppPageTransition } from "./app-page-transition"
import { QuickCreateMenu } from "./quick-create-menu"
import { RouteDocumentTitle } from "./route-document-title"

interface ShellProps {
  children: React.ReactNode
  brand: WorkspaceBrand
}

// Silently swallow failures so a notifications/auth hiccup never takes down the
// entire dashboard layout — the top bar gracefully falls back to "no data".
async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p
  } catch {
    return null
  }
}

export async function Shell({ children, brand }: ShellProps) {
  const [session, notifications, unreadCount] = await Promise.all([
    safe(auth()),
    safe(getNotifications()),
    safe(getUnreadCount()),
  ])

  return (
    <div className="app-surface flex h-dvh overflow-hidden bg-background">
      <RouteDocumentTitle />
      <a
        href="#dashboard-main"
        className="sr-only fixed left-4 top-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus:not-sr-only"
      >
        Aller au contenu
      </a>
      <aside className="hidden h-full lg:flex">
        <Sidebar brand={brand} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="relative z-40 flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border/90 bg-card/95 px-3 shadow-[0_1px_2px_rgba(13,36,66,0.035)] backdrop-blur-xl sm:px-5 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <MobileSidebar brand={brand} />
            <AppBrand brand={brand} className="lg:hidden" />
            <GlobalSearch />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <QuickCreateMenu />
            <Link href="/dashboard/organisation" aria-label="Ouvrir l’agenda" title="Agenda" className="hidden size-9 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted sm:grid">
              <CalendarDays className="size-[17px]" />
            </Link>
            <NotificationBell
              notifications={(notifications ?? []) as any}
              unreadCount={unreadCount ?? 0}
            />
            <Link href="/dashboard/help" aria-label="Ouvrir l’aide" title="Aide" className="hidden size-9 place-items-center rounded-lg text-foreground transition-colors hover:bg-muted md:grid">
              <CircleHelp className="size-[17px]" />
            </Link>
            <div className="hidden 2xl:block"><ThemeToggle /></div>
            <UserMenu email={session?.user?.email} name={session?.user?.name} companyName={brand.name} />
          </div>
        </header>

        <main id="dashboard-main" className="relative flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5 sm:py-5 lg:px-7 lg:py-5">
          <div className="mx-auto w-full max-w-[1520px]">
            <AppPageTransition>{children}</AppPageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}
