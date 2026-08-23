"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { markAsRead, markAllAsRead } from "@/actions/notifications"

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date | string
}

function relativeTime(d: Date | string) {
  const date = new Date(d)
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `${Math.floor(diff / 60)}min`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}j`
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: Notification[]
  unreadCount: number
}) {
  const router = useRouter()

  async function handleClick(id: string, isRead: boolean) {
    if (!isRead) {
      try {
        await markAsRead(id)
        router.refresh()
      } catch {}
    }
  }

  async function handleMarkAll() {
    try {
      await markAllAsRead()
      router.refresh()
    } catch {}
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Ouvrir les notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center border-2 border-background">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(360px,calc(100vw-1rem))]">
        <div className="flex items-center justify-between px-2 pt-1">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs font-bold uppercase text-primary hover:underline"
            >
              Tout marquer lu
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-[360px] overflow-y-auto">
          {notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              Aucune notification.
            </p>
          ) : (
            <ul>
              {notifications.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n.id, n.isRead)}
                    className={cn(
                      "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors",
                      !n.isRead && "bg-primary/5"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn("text-sm font-semibold", !n.isRead && "text-foreground")}>
                        {n.title}
                      </p>
                      <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DropdownMenuSeparator />
        <Link
          href="/dashboard/notifications"
          className="block px-3 py-2 text-xs text-center text-primary hover:bg-muted/50 font-bold uppercase tracking-wider"
        >
          Voir toutes
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
