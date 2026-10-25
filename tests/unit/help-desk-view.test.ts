import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ read: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/actions/operations", () => ({ getHelpDeskDashboard: mocks.read }))
import HelpDeskPage from "@/app/dashboard/service/help-desk/page"
import { helpDeskQuery } from "@/lib/operations/help-desk"

const membershipId = `c${"a".repeat(24)}`
const fixture = () => ({
  filters: helpDeskQuery.parse({ status: "WAITING", priority: "HIGH", search: "Fictional needle", assignedMembershipId: membershipId, page: 2, memberSearch: "Fictional team", memberPage: 2 }),
  total: 51, page: 2, asOf: new Date("2030-06-17T11:00:00Z"), timeZone: "Europe/Paris",
  metrics: { breached: 51, firstResponseBreached: 7, urgent: 3, unassigned: 9, waiting: 12 },
  members: [], memberTotal: 51, memberPage: 2, selectedMember: { id: membershipId, name: "Fictional chosen member" },
  tickets: [{ id: "fictional-ticket", number: "FIC-1", title: "Fictional scoped ticket", status: "WAITING", priority: "HIGH", firstRespondedAt: null,
    client: { name: "Fictional client" }, site: { label: "Fictional site", city: null }, equipment: null, assignedMembership: null,
    _count: { interventions: 1 }, targetAt: new Date("2030-06-17T12:00:00Z"), firstResponseTargetAt: new Date("2030-06-17T10:00:00Z"), slaSource: "CUSTOM" as const }],
}) satisfies Awaited<ReturnType<typeof import("@/actions/operations").getHelpDeskDashboard>>

describe("Main Help Desk server view", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })
  const render = async () => { mocks.read.mockResolvedValueOnce(fixture()); return renderToStaticMarkup(await HelpDeskPage({ searchParams: Promise.resolve({}) })) }
  it("uses global totals and preserves each independent page and selected responsible member", async () => {
    const html = (await render()).replaceAll("&amp;", "&")
    expect(html).toContain("51 ticket(s) correspondant aux filtres")
    expect(html).toContain("Fictional chosen member")
    expect(html).toContain("choix actuel")
    for (const [label, pageKey, otherKey] of [["tickets", "page", "memberPage"], ["responsables", "memberPage", "page"]]) {
      const nav = html.match(new RegExp(`<nav aria-label="Pagination des ${label}"[^>]*>([\\s\\S]*?)</nav>`))![1]
      const urls = [...nav.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1], "https://example.test"))
      expect(urls.map(url => url.searchParams.get(pageKey))).toEqual(["1", "3"])
      for (const url of urls) {
        expect(url.searchParams.get(otherKey)).toBe("2")
        expect(url.searchParams.get("search")).toBe("Fictional needle")
        expect(url.searchParams.get("memberSearch")).toBe("Fictional team")
        expect(url.searchParams.get("assignedMembershipId")).toBe(membershipId)
        expect(url.searchParams.get("status")).toBe("WAITING")
      }
    }
    const links = [...html.matchAll(/href="([^"]+)"/g)].map(match => new URL(match[1], "https://example.test"))
    expect(links.some(url => url.searchParams.get("status") === "OPEN" && url.searchParams.get("page") === "1")).toBe(true)
  })
  it("formats deadlines in the company's timezone regardless of the server timezone", async () => {
    for (const serverZone of ["Asia/Tokyo", "America/New_York"]) {
      vi.stubEnv("TZ", serverZone)
      const html = await render()
      expect(html).toContain("1re réponse avant 17 juin 2030, 12:00")
      expect(html).toContain("17 juin 2030, 14:00")
    }
  })
})
