import { describe, expect, it } from "vitest"
import { expectedMutation, requireSuccessfulMutation } from "@/lib/mutation-result"

describe("Expected failures at the server action boundary", () => {
  const messages = new Set(["Le dossier a changé."])

  it("keeps the successful result intact", async () => {
    const result = { id: "fictional-document", updatedAt: new Date("2030-01-01") }
    expect(await expectedMutation(async () => result, messages)).toBe(result)
    expect(requireSuccessfulMutation(result)).toBe(result)
  })

  it("returns an approved business message without serializing the exception", async () => {
    const error = Object.assign(new Error("Le dossier a changé."), { privateDetail: "fictional internal context" })
    const result = await expectedMutation(async () => { throw error }, messages)
    expect(JSON.parse(JSON.stringify(result))).toEqual({ success: false, error: "Le dossier a changé." })
    expect(() => requireSuccessfulMutation(result)).toThrow("Le dossier a changé.")
  })

  it("leaves an unexpected exception to Next.js production redaction", async () => {
    const error = new Error("fictional private database detail")
    await expect(expectedMutation(async () => { throw error }, messages)).rejects.toBe(error)
  })

  it("does not expose a non-Error object with a matching message", async () => {
    const error = { message: "Le dossier a changé.", privateDetail: "fictional internal context" }
    await expect(expectedMutation(async () => { throw error }, messages)).rejects.toBe(error)
  })

  it("does not consider a serialized refusal to be a successful save", () => {
    expect(() => requireSuccessfulMutation({ success: false, error: "Action refusée." })).toThrow("Action refusée.")
    expect(requireSuccessfulMutation({ success: true })).toEqual({ success: true })
  })
})
