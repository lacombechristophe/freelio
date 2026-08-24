import * as React from "react"
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
        <header className="relative z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/95 px-3 backdrop-blur-xl sm:px-5 lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-4">
            <MobileSidebar brand={brand} />
            <AppBrand brand={brand} className="lg:hidden" />
            <GlobalSearch />
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden sm:block"><ThemeToggle /></div>
            <NotificationBell
              notifications={(notifications ?? []) as any}
              unreadCount={unreadCount ?? 0}
            />
            <UserMenu email={session?.user?.email} name={session?.user?.name} />
          </div>
        </header>

        <main id="dashboard-main" className="relative flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1440px]">
            <AppPageTransition>{children}</AppPageTransition>
          </div>
        </main>
      </div>
    </div>
  )
}
