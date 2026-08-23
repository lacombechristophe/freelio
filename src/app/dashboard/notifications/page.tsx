import { getNotifications } from "@/actions/notifications"
import { NotificationsView } from "./notifications-view"

export default async function NotificationsPage() {
  const notifications = await getNotifications()
  return <NotificationsView notifications={(notifications ?? []) as any} />
}
