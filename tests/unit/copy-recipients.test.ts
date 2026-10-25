import { expect, it } from "vitest"
import { parseCopyRecipients, validateRecipients } from "@/lib/communications/recipients"

it("accepts bounded mailbox lists and refuses injected, duplicated or ambiguous addresses", () => {
  expect(parseCopyRecipients(" A@EXAMPLE.TEST ; b@example.test ")).toEqual(["a@example.test", "b@example.test"])
  expect(parseCopyRecipients("")).toEqual([])
  for (const value of ["a@example.test,", "a@example.test\r\nBcc: secret@example.test", '"Display" <a@example.test>', Array.from({ length: 21 }, (_, i) => `${i}@example.test`).join(",")]) expect(() => parseCopyRecipients(value)).toThrow()
  for (const [cc, bcc] of [[["to@example.test"], []], [["same@example.test"], ["SAME@example.test"]], [[], ["x@example.test", "X@example.test"]]]) expect(() => validateRecipients("TO@example.test", cc, bcc)).toThrow("qu’une fois")
})
