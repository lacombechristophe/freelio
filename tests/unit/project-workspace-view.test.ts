import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/demo-mode", () => ({ isReadOnlyDemo: false }))
vi.mock("@/actions/projets", () => ({
  createProjectAcceptanceItem: vi.fn(), createProjectMilestone: vi.fn(), deleteProjectAcceptanceItem: vi.fn(), deleteProjectMilestone: vi.fn(),
  updateProjectAcceptanceStatus: vi.fn(), updateProjectMilestoneStatus: vi.fn(), updateProjectMilestonePlanning: vi.fn(), upsertProjectTechnicalProfile: vi.fn(),
}))
import { ProjectWorkspace } from "@/app/dashboard/projets/[id]/project-workspace"

describe("Project workspace static render", () => {
  afterEach(() => { vi.unstubAllEnvs() })
  const revision = "2030-02-20T12:00:00.000Z"
  const props = {
    projectId: "fictitious-project", canWrite: false,
    milestones: [{ id: "fictitious-milestone", updatedAt: revision, title: "Fictitious milestone", kind: "MILESTONE", status: "PENDING", durationDays: 1 }],
    acceptanceItems: [{ id: "fictitious-control", updatedAt: revision, title: "Fictitious control", status: "TODO" }],
    files: [{ id: "fictitious-file", name: "Fictitious PDF", size: 100, type: "application/pdf", createdAt: revision }],
    members: [], profile: { updatedAt: revision, surveyStatus: "SURVEYED" as const, poolLengthMm: 8000 },
  }
  it("keeps consultation while disabling mutation controls for a reader", () => {
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, props))
    const buttons = [...html.matchAll(/<button\b[^>]*>/g)].map(match => match[0])
    expect(buttons.length).toBeGreaterThan(5)
    expect(buttons.every(button => /\bdisabled=""/.test(button))).toBe(true)
    expect(html).toContain("Fictitious milestone")
    expect(html).toContain("8000 mm")
    expect(html).toContain("/api/files/project/fictitious-file")
  })
  it("explains unavailable references without removing the own milestone", () => {
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, {
      ...props, canWrite: true,
      milestones: [{ ...props.milestones[0], dependencyUnavailable: true, assigneeUnavailable: true, templateUnavailable: true }],
    }))
    expect(html).toContain("Fictitious milestone")
    expect(html).toContain("Dépendance indisponible")
    expect(html).toContain("Responsable indisponible")
    expect(html).toContain("Étape de modèle indisponible")
    for (const title of ["Planifier", "Supprimer"]) expect(html).toMatch(new RegExp(`<button(?=[^>]*title="${title}")(?=[^>]*disabled="")[^>]*>`))
  })
  it.each(["UTC", "Pacific/Kiritimati"])("keeps the registered calendar day when rendered in %s", zone => {
    vi.stubEnv("TZ", zone)
    const html = renderToStaticMarkup(createElement(ProjectWorkspace, {
      ...props, milestones: [{ ...props.milestones[0], plannedStartAt: revision, dueDate: revision }],
      profile: { ...props.profile, surveyedAt: revision },
    }))
    expect(html.match(/20\/02\/2030/g)).toHaveLength(3)
  })
})
