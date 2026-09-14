import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  withAuth: vi.fn(), articles: vi.fn(), surveys: vi.fn(), requests: vi.fn(), clients: vi.fn(), tickets: vi.fn(),
}))
vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth-wrapper", () => ({ withAuth: mocks.withAuth }))
vi.mock("@/lib/audit", () => ({ logAction: vi.fn() }))
vi.mock("@/lib/prisma", () => ({ default: {
  knowledgeArticle: { findMany: mocks.articles }, satisfactionSurvey: { findMany: mocks.surveys },
  satisfactionRequest: { findMany: mocks.requests }, client: { findMany: mocks.clients }, serviceTicket: { findMany: mocks.tickets },
} }))

import { getServiceContentDashboard } from "@/actions/service-content"

function request(anonymous: boolean) {
  const date = new Date("2026-09-01T12:00:00Z")
  return {
    id: "request-1", companyId: "company-a", clientId: "client-secret", contactId: "contact-secret", serviceTicketId: "ticket-secret",
    tokenHash: "private-token-hash", metadata: { recipient: "private@example.test" },
    survey: { name: "Après intervention", type: "CSAT", scaleMin: 1, scaleMax: 5, anonymous },
    client: { id: "client-secret", name: "Client privé" }, contact: { firstName: "Camille", lastName: "Privé", email: "private@example.test" },
    serviceTicket: { id: "ticket-secret", number: "SAV-SECRET", title: "Intervention" },
    status: "RESPONDED", score: 5, comment: "Très satisfait", expiresAt: date, sentAt: date, respondedAt: date, createdAt: date, updatedAt: date,
  }
}

describe("satisfaction results payload", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.withAuth.mockImplementation((action) => action({ companyId: "company-a" }))
    for (const query of [mocks.articles, mocks.surveys, mocks.requests, mocks.clients, mocks.tickets]) query.mockResolvedValue([])
  })

  it("removes anonymous identity, relation identifiers, token hashes and metadata from serialized results", async () => {
    mocks.requests.mockResolvedValue([request(true)])
    const result = await getServiceContentDashboard()
    expect(result?.requests[0]).toMatchObject({ client: { id: null, name: "Réponse anonyme" }, contact: null, serviceTicket: null, score: 5, comment: "Très satisfait" })
    const serialized = JSON.stringify(result?.requests)
    for (const secret of ["client-secret", "contact-secret", "ticket-secret", "private-token-hash", "private@example.test", "Client privé", "SAV-SECRET"]) {
      expect(serialized).not.toContain(secret)
    }
    expect(result?.metrics.csatPercent).toBe(100)
  })

  it("keeps permitted named relations without exposing internal request fields", async () => {
    const item = request(false)
    mocks.requests.mockResolvedValue([item])
    const result = await getServiceContentDashboard()
    expect(result?.requests[0]).toMatchObject({ client: item.client, contact: item.contact, serviceTicket: item.serviceTicket, createdAt: item.createdAt.toISOString() })
    for (const field of ["tokenHash", "metadata", "companyId", "clientId", "contactId", "serviceTicketId"]) expect(result?.requests[0]).not.toHaveProperty(field)
  })

  it("scopes every query to the authorized tenant and requires service read permission", async () => {
    await getServiceContentDashboard()
    expect(mocks.withAuth).toHaveBeenCalledWith(expect.any(Function), "service.read")
    for (const query of [mocks.articles, mocks.surveys, mocks.requests, mocks.clients, mocks.tickets]) {
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ companyId: "company-a" }) }))
    }
  })

  it("does not query data when permission is denied", async () => {
    mocks.withAuth.mockRejectedValue(new Error("Access denied"))
    await expect(getServiceContentDashboard()).rejects.toThrow("Access denied")
    for (const query of [mocks.articles, mocks.surveys, mocks.requests, mocks.clients, mocks.tickets]) expect(query).not.toHaveBeenCalled()
  })
})
