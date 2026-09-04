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

type Notification = {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: Date | string
}

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  PAYMENT: { icon: CheckCircle2, color: "text-success bg-success/10" },
  SYSTEM: { icon: Zap, color: "text-primary bg-primary/10" },
  BILLING: { icon: Receipt, color: "text-primary bg-primary/10" },
  OVERDUE: { icon: AlertCircle, color: "text-danger bg-danger/10" },
  CONTRACT: { icon: FileSignature, color: "text-primary bg-primary/10" },
}

function relativeTime(d: Date | string) {
  const date = new Date(d)
  const diff = (Date.now() - date.getTime()) / 1000
  if (diff < 60) return "à l'instant"
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}h`
  if (diff < 2_592_000) return `il y a ${Math.floor(diff / 86400)}j`
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

export function NotificationsView({ notifications }: { notifications: Notification[] }) {
  const router = useRouter()
  const confirmDialog = useConfirm()

  async function handleMark(id: string) {
    try {
      await markAsRead(id)
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleDelete(id: string) {
    try {
      await deleteNotification(id)
      toast.success("Notification supprimée.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleMarkAll() {
    try {
      await markAllAsRead()
      toast.success("Toutes marquées comme lues.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  async function handleClearAll() {
    if (!(await confirmDialog({
      title: "Supprimer toutes les notifications ?",
      description: "Cette action est irréversible.",
      confirmLabel: "Tout supprimer",
      destructive: true,
    }))) return
    try {
      await deleteAllNotifications()
      toast.success("Notifications supprimées.")
      router.refresh()
    } catch (err: any) { toast.error(err?.message ?? "Erreur.") }
  }

  const unread = notifications.filter((n) => !n.isRead).length

  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        eyebrow="Centre d’activité"
        title="Notifications"
        description="Retrouvez les paiements, échéances, signatures et événements importants de votre activité."
        actions={<>
          <PageHeaderStat label="Non lues" value={unread} />
          <Button variant="ghost" size="sm" className="gap-2" onClick={handleMarkAll} disabled={unread === 0}>
            <Check className="h-4 w-4" /> Tout marquer lu
          </Button>
          <Button variant="ghost" size="sm" className="text-danger hover:bg-danger/5 gap-2" onClick={handleClearAll} disabled={notifications.length === 0}>
            <Trash2 className="h-4 w-4" /> Vider
          </Button>
        </>}
      />

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-border bg-card">
          <EmptyState icon={Bell} title="Tout est à jour" description="Les prochains paiements, échéances ou événements importants apparaîtront ici." />
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
                onClick={() => !notif.isRead && handleMark(notif.id)}
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
                        <p className="text-xs uppercase font-bold text-muted-foreground tracking-widest pt-1">
                          {relativeTime(notif.createdAt)}
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
                          <DropdownMenuItem onClick={() => handleMark(notif.id)}>
                            Marquer comme lu
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-danger" onClick={() => handleDelete(notif.id)}>
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
