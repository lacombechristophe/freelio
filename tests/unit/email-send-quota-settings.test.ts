import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/communications", () => ({ configureCommunicationSendQuota: vi.fn() }))
import { SendQuotaSettings, type MailboxSendQuota } from "@/app/dashboard/communications/send-quota-settings"

describe("quota settings initial render", () => {
  vi.stubGlobal("React", React)
  afterAll(() => vi.unstubAllGlobals())
  const quota: MailboxSendQuota = { label: "Fictional mailbox", channelKey: "platform", version: 0, enabled: false, dailyRecipientLimit: null, minuteRecipientLimit: null,
    windows: [{ period: "DAY", used: 0, resetAt: "2026-10-21T00:00:00Z" }, { period: "MINUTE", used: 0, resetAt: "2026-10-20T12:35:00Z" }] }
  it("asks admins for explicit limits without inventing a provider allowance", () => {
    const html = renderToStaticMarkup(React.createElement(SendQuotaSettings, { quota, canManage: true }))
    expect(html).toContain("Configuration requise")
    expect(html).toContain("ne garantissent pas la gratuité")
    expect(html).toContain("CC et CCI compris")
    expect(html).toContain('name="daily"')
    expect(html).toContain('name="minute"')
    expect(html).not.toContain('value="100"')
  })
  it("shows usage without mutation controls for read-only viewers", () => {
    const html = renderToStaticMarkup(React.createElement(SendQuotaSettings, { quota: { ...quota, version: 2, enabled: true, dailyRecipientLimit: 40, minuteRecipientLimit: 5 }, canManage: false }))
    expect(html).toContain("Plafonds internes actifs")
    expect(html).toContain("0 / 40")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("Enregistrer les plafonds")
  })
})
