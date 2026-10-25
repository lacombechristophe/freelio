import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mode = vi.hoisted(() => ({ readOnly: false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/lib/demo-mode", () => ({ get isReadOnlyDemo() { return mode.readOnly } }))
vi.mock("@/components/shared/confirm-provider", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/actions/notifications", () => ({ deleteAllNotifications: vi.fn(), deleteNotification: vi.fn(), markAllAsRead: vi.fn(), markAsRead: vi.fn() }))
import { NotificationsView } from "@/app/dashboard/notifications/notifications-view"

const props = () => ({
  notifications: [{ id: "fictional-notification", type: "SYSTEM", title: "Fictional older notification", message: "Fictional activity", isRead: true, createdAt: "2030-01-01T12:00:00.000Z", ageLabel: "Il y a 1 jour" }],
  total: 51, totalAll: 51, unreadCount: 1, query: { search: "Fictional & older", status: "READ" as const, page: 2 },
})
function button(html: string, label: string) {
  const match = [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(value => value[0]).find(value => value.includes(label))
  expect(match).toBeDefined()
  return match!
}
describe("Notification directory server markup", () => {
  beforeEach(() => { mode.readOnly = false })
  it("shows the full unread indicator even when every displayed notification is read", () => {
    const html = renderToStaticMarkup(createElement(NotificationsView, props()))
    expect(html).toMatch(/Non lues<\/p><p[^>]*>1<\/p>/)
    expect(html).toContain("51 résultats")
    expect(html).toContain("Page 2 sur 3")
    expect(html).toContain("Fictional older notification")
    expect(button(html, "Tout marquer lu")).not.toContain('disabled=""')
  })
  it("keeps URL search and read filters in the consultation form", () => {
    const html = renderToStaticMarkup(createElement(NotificationsView, props()))
    expect(html).toContain('action="/dashboard/notifications" method="get"')
    expect(html).toContain('aria-label="Rechercher une notification"')
    expect(html).toContain('value="Fictional &amp; older"')
    expect(html).toContain('<option value="READ" selected="">Lues</option>')
    expect(button(html, "Page précédente")).not.toContain('disabled=""')
    expect(button(html, "Page suivante")).not.toContain('disabled=""')
  })
  it("distinguishes an empty filter result from an empty history", () => {
    const html = renderToStaticMarkup(createElement(NotificationsView, { ...props(), notifications: [], total: 0, query: { ...props().query, page: 1 } }))
    expect(html).toContain("Aucune notification trouvée")
    expect(html).not.toContain("Tout est à jour")
    expect(button(html, "Vider")).not.toContain('disabled=""')
    const empty = renderToStaticMarkup(createElement(NotificationsView, { ...props(), notifications: [], total: 0, totalAll: 0, unreadCount: 0, query: { ...props().query, page: 1 } }))
    expect(empty).toContain("Tout est à jour")
    expect(button(empty, "Vider")).toContain('disabled=""')
  })
  it("keeps search and pagination usable in the public demo while disabling writes", () => {
    mode.readOnly = true
    const html = renderToStaticMarkup(createElement(NotificationsView, props()))
    for (const label of ["Tout marquer lu", "Vider"]) expect(button(html, label)).toContain('disabled=""')
    for (const label of ["Rechercher", "Page précédente", "Page suivante"]) expect(button(html, label)).not.toContain('disabled=""')
    expect(html).toContain("Fictional older notification")
  })
})
