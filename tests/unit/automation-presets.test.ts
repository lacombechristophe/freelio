import { describe, expect, it } from "vitest"

import { POOL_AUTOMATION_SEQUENCES, POOL_AUTOMATION_WORKFLOWS, POOL_EMAIL_TEMPLATES } from "@/lib/automations/presets"

describe("pool contractor automation presets", () => {
  it("ships a concise, trade-focused starter library", () => {
    expect(POOL_EMAIL_TEMPLATES).toHaveLength(3)
    expect(POOL_AUTOMATION_SEQUENCES).toHaveLength(2)
    expect(POOL_AUTOMATION_WORKFLOWS).toHaveLength(5)
    expect(JSON.stringify({ POOL_EMAIL_TEMPLATES, POOL_AUTOMATION_SEQUENCES, POOL_AUTOMATION_WORKFLOWS })).not.toMatch(/web|SaaS|application mobile|UX\/UI/i)
  })

  it("keeps sequence steps valid and human-reviewed where needed", () => {
    for (const sequence of POOL_AUTOMATION_SEQUENCES) {
      expect(sequence.steps.length).toBeGreaterThan(1)
      for (const step of sequence.steps) {
        expect(step.delayHours).toBeGreaterThanOrEqual(0)
        if (step.type === "EMAIL") {
          expect(step.subject.length).toBeGreaterThan(1)
          expect(step.bodyHtml).toContain("{{company.name}}")
        } else {
          expect(step.taskTitle?.length).toBeGreaterThan(1)
        }
      }
    }
    expect(POOL_AUTOMATION_SEQUENCES.flatMap((sequence) => sequence.steps).some((step) => step.pauseUntilComplete)).toBe(true)
  })

  it("resolves every sequence placeholder to a valid workflow action", () => {
    const sequenceNames = new Set(POOL_AUTOMATION_SEQUENCES.map((sequence) => sequence.name))
    const supportedActions = new Set(["ENROLL_PRESET_SEQUENCE", "CREATE_TASK", "NOTIFY_TEAM", "UPDATE_LEAD_STATUS"])
    for (const workflow of POOL_AUTOMATION_WORKFLOWS) {
      expect(workflow.actions.length).toBeGreaterThan(0)
      for (const action of workflow.actions) {
        expect(supportedActions.has(String(action.type))).toBe(true)
        if (action.type === "ENROLL_PRESET_SEQUENCE") expect(sequenceNames.has(String(action.sequenceName))).toBe(true)
      }
    }
  })
})
