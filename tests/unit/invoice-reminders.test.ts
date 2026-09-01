import { describe, expect, it } from "vitest"

import {
  buildInvoiceReminderContent,
  invoiceDaysOverdue,
  invoiceReminderSourceKey,
  parseInvoiceReminderSettings,
  plainTextToEmailHtml,
  selectInvoiceReminderStep,
} from "@/lib/finance/invoice-reminders"

describe("invoice reminders", () => {
  it("normalizes, sorts and deduplicates configured steps", () => {
    expect(parseInvoiceReminderSettings([{ daysAfterDue: 20 }, { daysAfterDue: 3 }, { daysAfterDue: 3 }], true)).toEqual({
      enabled: true,
      steps: [{ daysAfterDue: 3 }, { daysAfterDue: 20 }],
    })
  })

  it("builds stable keys and progressive copy", () => {
    const dueDate = new Date("2026-08-01T00:00:00.000Z")
    expect(invoiceReminderSourceKey(10)).toBe("AUTO:DUE+10")
    expect(invoiceDaysOverdue(dueDate, new Date("2026-08-11T12:00:00.000Z"))).toBe(10)
    const content = buildInvoiceReminderContent({ companyName: "Piscines Exemple", invoiceNumber: "FACT-2026-001", remainingCents: 125_000, dueDate, daysAfterDue: 20 })
    expect(content.subject).toContain("Rappel important")
    expect(content.message).toContain("FACT-2026-001")
    expect(content.message).toContain("1 250,00")
  })

  it("escapes reminder copy before producing HTML", () => {
    const html = plainTextToEmailHtml("Bonjour <client> & équipe\n\nMerci")
    expect(html).toContain("&lt;client&gt; &amp; équipe")
    expect(html).not.toContain("<client>")
    expect(html).toContain("<p>Merci</p>")
  })

  it("selects only the latest due stage when automation starts late", () => {
    const selected = selectInvoiceReminderStep({
      dueDate: new Date("2026-08-01T00:00:00.000Z"),
      at: new Date("2026-08-25T12:00:00.000Z"),
      steps: [{ daysAfterDue: 3 }, { daysAfterDue: 10 }, { daysAfterDue: 20 }],
      reminders: [],
    })
    expect(selected).toEqual({ daysAfterDue: 20 })
  })

  it("advances after a sent stage and throttles recent failures", () => {
    const dueDate = new Date("2026-08-01T00:00:00.000Z")
    const at = new Date("2026-08-12T12:00:00.000Z")
    const steps = [{ daysAfterDue: 3 }, { daysAfterDue: 10 }, { daysAfterDue: 20 }]
    expect(selectInvoiceReminderStep({
      dueDate,
      at,
      steps,
      reminders: [{ sourceKey: "AUTO:DUE+3", status: "SENT", updatedAt: new Date("2026-08-04T09:00:00.000Z") }],
    })).toEqual({ daysAfterDue: 10 })
    expect(selectInvoiceReminderStep({
      dueDate,
      at,
      steps,
      reminders: [{ sourceKey: "AUTO:DUE+10", status: "FAILED", updatedAt: new Date("2026-08-12T08:00:00.000Z") }],
    })).toBeNull()
  })
})
