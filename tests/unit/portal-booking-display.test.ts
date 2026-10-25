import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
import { PortalWorkspace } from "@/app/portal/portal-workspace"
import type { PortalAppointment } from "@/lib/scheduling/appointment"

const request: PortalAppointment = { id: "fictional", subject: "Fictional appointment", preferredStart: "2027-01-15T08:00:00Z", alternativeStart: null,
  durationMinutes: 60, notes: null, status: "CONFIRMED", response: null, updatedAt: "2027-01-01T00:00:00Z", assignedMembershipId: "fictional-member",
  scheduledStart: "2027-01-15T09:00:00Z", scheduledEnd: "2027-01-15T10:00:00Z", confirmedAt: "2027-01-01T00:00:00Z", member: "Fictional member" }
const render = (row = request) => renderToStaticMarkup(React.createElement(PortalWorkspace, { messages: [], initialAppointments: { items: [row], page: 1, total: 1 }, timeZone: "Europe/Paris" }))
afterEach(() => vi.unstubAllEnvs())
describe("public booking display preserves confirmed versus requested times", () => {
  it("renders the same confirmed instants in different host zones", () => {
    vi.stubEnv("TZ", "Pacific/Honolulu"); const first = render()
    vi.stubEnv("TZ", "Asia/Tokyo"); expect(render()).toBe(first)
    expect(first).toContain("Créneau réservé"); expect(first).toContain("10:00"); expect(first).toContain("11:00"); expect(first).toContain("Europe/Paris")
  })
  it("labels a legacy confirmation without inventing a reservation", () => {
    const html = render({ ...request, assignedMembershipId: null, scheduledStart: null, scheduledEnd: null, confirmedAt: null, member: null })
    expect(html).toContain("Confirmation historique"); expect(html).not.toContain("Créneau réservé")
  })
  it("shows cancellation as a historical slot rather than a current reservation", () => {
    const html = render({ ...request, status: "CANCELLED" }); expect(html).toContain("Ancien créneau"); expect(html).not.toContain("Créneau réservé")
  })
})
