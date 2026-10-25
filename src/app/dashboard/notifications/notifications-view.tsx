"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Bell, CheckCircle2, AlertCircle, Receipt, FileSignature, Zap,
  MoreVertical, Trash2, Check,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import {
  deleteAllNotifications,
  deleteNotification,
  markAllAsRead,
  markAsRead,
} from "@/actions/notifications"
import { useConfirm } from "@/components/shared/confirm-provider"
import { EmptyState } from "@/components/shared/empty-state"
import { PageHeader, PageHeaderStat } from "@/components/shared/page-header"
import { DirectoryPagination } from "@/components/shared/directory-pagination"
import { Input } from "@/components/ui/input"
import { isReadOnlyDemo } from "@/lib/demo-mode"
import type { NotificationQuery } from "@/lib/notification-query"

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date | string
  ageLabel: string
}

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  PAYMENT: { icon: CheckCircle2, color: "text-success bg-success/10" },
  SYSTEM: { icon: Zap, color: "text-primary bg-primary/10" },
  BILLING: { icon: Receipt, color: "text-primary bg-primary/10" },
  OVERDUE: { icon: AlertCircle, color: "text-danger bg-danger/10" },
  CONTRACT: { icon: FileSignature, color: "text-primary bg-primary/10" },
}

export function NotificationsView({ notifications, total, totalAll, unreadCount, query }: {
  notifications: Notification[]; total: number; totalAll: number; unreadCount: number; query: NotificationQuery
}) {
  const router = useRouter()
  const confirmDialog = useConfirm()
  const [pending, startTransition] = React.useTransition()

  function changePage(page: number) {
    const params = new URLSearchParams({ search: query.search, status: query.status, page: String(page) })
    startTransition(() => router.push(`/dashboard/notifications?${params}`))
  }

  async function handleMark(id: string) {
    if (isReadOnlyDemo) return
    try {
      await markAsRead(id)
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleDelete(id: string) {
    if (isReadOnlyDemo) return
    try {
      await deleteNotification(id)
      toast.success("Notification supprimée.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleMarkAll() {
    if (isReadOnlyDemo) return
    try {
      await markAllAsRead()
      toast.success("Toutes marquées comme lues.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleClearAll() {
    if (isReadOnlyDemo) return
    if (!(await confirmDialog({
      title: "Supprimer toutes les notifications ?",
      description: "Toutes vos notifications de cet espace seront supprimées, y compris celles masquées par la recherche ou les filtres. Cette action est irréversible.",
      confirmLabel: "Tout supprimer",
      destructive: true,
    }))) return
    try {
      await deleteAllNotifications()
      toast.success("Notifications supprimées.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        eyebrow="Centre d’activité"
        title="Notifications"
        description="Retrouvez les paiements, échéances, signatures et événements importants de votre activité."
        actions={<>
          <PageHeaderStat label="Non lues" value={unreadCount} />
          <Button demoMutation variant="ghost" size="sm" className="gap-2" onClick={handleMarkAll} disabled={unreadCount === 0} title="Marquer toutes vos notifications de cet espace comme lues, y compris hors des filtres.">
            <Check className="h-4 w-4" /> Tout marquer lu
          </Button>
          <Button demoMutation variant="ghost" size="sm" className="text-danger hover:bg-danger/5 gap-2" onClick={handleClearAll} disabled={totalAll === 0}>
            <Trash2 className="h-4 w-4" /> Vider
          </Button>
        </>}
      />

      <form key={`${query.search}:${query.status}`} action="/dashboard/notifications" method="get" className="flex flex-wrap items-center gap-2">
        <Input name="search" aria-label="Rechercher une notification" placeholder="Rechercher une notification" maxLength={200} defaultValue={query.search} className="max-w-sm" />
        <select name="status" aria-label="État de lecture" defaultValue={query.status} className="h-10 rounded-lg border border-input bg-background px-3 text-sm">
          <option value="ALL">Toutes</option><option value="UNREAD">Non lues</option><option value="READ">Lues</option>
        </select>
        <Button type="submit" demoMutation={false} variant="outline">Rechercher</Button>
      </form>
      <DirectoryPagination total={total} page={query.page} pending={pending} error={false} onPage={changePage} onRetry={() => startTransition(() => router.refresh())} />

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Bell} title={totalAll === 0 ? "Tout est à jour" : "Aucune notification trouvée"} description={totalAll === 0 ? "Les prochains paiements, échéances ou événements importants apparaîtront ici." : "Essayez une autre recherche ou un autre état de lecture."} />
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notif) => {
            const cfg = typeConfig[notif.type] ?? typeConfig.SYSTEM
            return (
              <Card
                key={notif.id}
                className={cn(
                  "group cursor-pointer transition-[border-color,background-color,box-shadow] hover:border-primary/20 hover:bg-muted/30",
                  !notif.isRead && "border-primary/20 bg-primary/[0.025]"
                )}
                onClick={() => !isReadOnlyDemo && !notif.isRead && handleMark(notif.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", cfg.color)}>
                        <cfg.icon className="h-5 w-5" />
                      </div>
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={cn("text-sm font-bold", !notif.isRead ? "text-foreground" : "text-muted-foreground")}>
                            {notif.title}
                          </p>
                          {!notif.isRead && <Badge className="bg-primary hover:bg-primary h-2 w-2 rounded-full p-0" />}
                        </div>
                        <p className="text-sm text-muted-foreground leading-snug">{notif.message}</p>
                        <p className="pt-1 text-xs font-medium text-muted-foreground">
                          {notif.ageLabel}
                        </p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button aria-label={`Actions pour ${notif.title}`} variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!notif.isRead && (
                          <DropdownMenuItem demoMutation onClick={() => handleMark(notif.id)}>
                            Marquer comme lu
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem demoMutation className="text-danger" onClick={() => handleDelete(notif.id)}>
                          Supprimer
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
