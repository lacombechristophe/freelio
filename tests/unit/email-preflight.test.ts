import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
vi.mock("@/lib/communications/email-provider", () => ({ sendEmailThroughChannel: vi.fn() }))
import { emailContentPreflight, EmailContentPreflightError } from "@/lib/communications/email-preflight"
import { EMAIL_TEMPLATE_VARIABLES } from "@/lib/communications/email-template-variables"
import { prepareSequenceEmail, renderEmailVariables, sendSequenceEmail } from "@/lib/automations/email"
import { sendEmailThroughChannel } from "@/lib/communications/email-provider"

const context = { company: { id: "fiction", name: "Fictional company", email: "sender@example.test" },
  lead: { id: "fiction", firstName: "Fiction", lastName: "Recipient", email: "recipient@example.test", contactId: "fiction", projectType: null, city: null } }
describe("sequence content and link preflight", () => {
  it("accepts all supported variables and decodes retained link entities without opening them", () => {
    const body = `<p>${EMAIL_TEMPLATE_VARIABLES.join(" ")}</p><a href="https://example.test/?a=1&amp;b=2">Voir le dossier</a>`
    expect(emailContentPreflight("Bonjour {{contact.firstName}}", body)).toMatchObject({ ok: true, linkCount: 1, issues: [] })
  })
  it.each(["", "<p>&nbsp; &#8203; &#xFEFF;</p>", "<script>visibleInSourceOnly()</script><style>p{}</style>", "<p><br></p>"])("refuses an empty retained body: %s", body => {
    expect(emailContentPreflight("Sujet", body)).toMatchObject({ ok: false, issues: expect.arrayContaining([expect.objectContaining({ code: "EMPTY_BODY" })]) })
  })
  it.each(['<a href="/booking">Visite</a>', '<a href="javascript:alert(1)">Visite</a>', '<a href=https://example.test>Visite</a>', '<a href="https://">Visite</a>'])("reports a link that would be lost or invalid: %s", body => {
    expect(emailContentPreflight("Sujet", body)).toMatchObject({ ok: false, linkCount: 1, issues: expect.arrayContaining([expect.objectContaining({ code: "INVALID_LINK", linkIndex: 1 })]) })
  })
  it("reports credential-bearing URLs, and keeps transport and personalized-link warnings distinct", () => {
    const report = emailContentPreflight("Sujet", '<p>Visite</p><a href="https://user:secret@example.test/">Un</a><a href="http://example.test/{{lead.city}}">Deux</a>')
    expect(report.ok).toBe(false)
    expect(report.issues.map(issue => issue.code)).toEqual(["LINK_CREDENTIALS", "HTTP_LINK", "DYNAMIC_LINK"])
    expect(JSON.stringify(report)).not.toContain("secret")
    expect(emailContentPreflight("Sujet", '<a href="http://example.test/">Visite</a>').ok).toBe(true)
  })
  it("rejects unsupported subject/body variables without echoing their content", () => {
    const report = emailContentPreflight("{{contact.secret}}", "<p>{{unsupported.private}}</p>")
    expect(report.issues.filter(issue => issue.code === "UNKNOWN_VARIABLE").map(issue => issue.field)).toEqual(["subject", "body"])
    expect(JSON.stringify(report)).not.toContain("secret")
  })
  it("ignores variables in content already discarded by the sanitizer", () => {
    expect(emailContentPreflight("Sujet", "<p>Bonjour</p><!--{{unused}}--><script>{{unused}}</script>").ok).toBe(true)
  })
  it("bounds subject and raw/rendered body sizes", () => {
    expect(emailContentPreflight("\u200b ", "Texte").issues[0].code).toBe("EMPTY_SUBJECT")
    expect(emailContentPreflight("x".repeat(251), "Texte").ok).toBe(false)
    expect(emailContentPreflight("Sujet", "x".repeat(100_001)).issues[0].code).toBe("LONG_BODY")
    expect(emailContentPreflight("Sujet", "x".repeat(110_001), false).issues[0].code).toBe("LONG_BODY")
  })
  it("renders values once, preserving literal tokens in recipient data and HTML escaping", () => {
    const data = { ...context, lead: { ...context.lead, firstName: '{{company.name}} <b> & "' } }
    expect(renderEmailVariables("{{contact.firstName}} / {{company.name}}", data)).toBe('{{company.name}} <b> & " / Fictional company')
    const body = renderEmailVariables("<p>{{contact.firstName}}</p>", data, true)
    expect(body).toContain("{{company.name}} &lt;b&gt; &amp; &quot;")
    expect(emailContentPreflight("Sujet", body, false).ok).toBe(true)
  })
  it("refuses empty personalized content before consent generation or transport", async () => {
    await expect(prepareSequenceEmail({ ...context, subjectTemplate: "Sujet", bodyTemplate: "<p>{{lead.city}}</p>" })).rejects.toBeInstanceOf(EmailContentPreflightError)
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })
  it("checks frozen content before a new send without regenerating its personalized fields", async () => {
    await expect(sendSequenceEmail({ ...context, subjectTemplate: "Unused", bodyTemplate: "Unused", idempotencyKey: "fiction", prepared: { subject: "Sujet", html: '<a href="/invalid">Visite</a>', headers: {} } })).rejects.toBeInstanceOf(EmailContentPreflightError)
    expect(sendEmailThroughChannel).not.toHaveBeenCalled()
  })
})
