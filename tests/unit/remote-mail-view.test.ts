import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { remoteAttachmentKey, remoteMailView } from "@/lib/communications/remote-mail-view"
import { RemoteMessageState } from "@/app/dashboard/communications/remote-message-state"
import type { RemoteMailAttachment } from "@/lib/communications/remote-mail-types"

const file: RemoteMailAttachment = { id: "private-provider-id", name: "fiction.pdf", type: "application/pdf", size: 32, kind: "GMAIL_ATTACHMENT", inline: false }
const observation = { presence: "PRESENT", read: false, folderIds: ["private-folder-id"], folderNames: ["Archives"], checkedAt: "2026-10-20T10:00:00.000Z", attachments: [file], attachmentsComplete: true }
const render = (value: unknown, disabled = false) => renderToStaticMarkup(React.createElement(RemoteMessageState, { messageId: "fictional-message", state: remoteMailView(value), disabled }))
describe("mail observations expose state without remote attachment locators", () => {
  it("uses a stable attachment key independent of JSON property order", () => {
    expect(remoteAttachmentKey(file)).toBe(remoteAttachmentKey({ kind: file.kind, inline: file.inline, size: file.size, type: file.type, name: file.name, id: file.id }))
  })
  it("does not expose remote attachment IDs, kinds or private locators in the DTO", () => {
    const view = remoteMailView(observation)!
    expect(view.attachments[0]).toMatchObject({ key: expect.stringMatching(/^[a-f0-9]{64}$/), name: file.name, refusal: null })
    expect(view.attachments[0]).not.toHaveProperty("id"); expect(view.attachments[0]).not.toHaveProperty("kind")
  })
  it("labels unknown historical observations instead of guessing read state", () => expect(render(null)).toContain("État fournisseur non observé."))
  it("renders provider read state, observation time and a remote-only attachment description", () => {
    const html = render(observation)
    expect(html).toContain("Non lu chez le fournisseur"); expect(html).toContain("Archives"); expect(html).toContain("UTC"); expect(html).toContain("aucune archive locale durable")
    expect(html).not.toContain("private-provider-id"); expect(html).not.toContain("private-folder-id")
  })
  it("keeps an absent message explicitly distinct from a deleted local copy", () => {
    const html = render({ ...observation, presence: "MISSING" }); expect(html).toContain("copie CRM conservée"); expect(html).not.toContain(">Télécharger<")
  })
  it("does not offer a provider read in the public demo", () => {
    const html = render(observation, true); expect(html).toContain("Lecture fournisseur désactivée dans la démo"); expect(html).not.toContain(">Télécharger<")
  })
  it("keeps an unsupported file visible with an explanation", () => {
    const html = render({ ...observation, attachments: [{ ...file, type: "application/zip" }] }); expect(html).toContain(file.name); expect(html).toContain("Type de pièce non pris en charge")
  })
  it("rejects path traversal locators before exposing download controls", () => {
    expect(remoteMailView({ ...observation, attachments: [{ ...file, id: ".." }] })).toBeNull()
  })
})
