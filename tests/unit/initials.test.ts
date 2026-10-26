import { expect, it } from "vitest"
import { initialGlyph, initials } from "@/lib/initials"

it("keeps composed characters intact in avatars", () => {
  expect(initialGlyph("👩🏽‍💻 Atelier")).toBe("👩🏽‍💻")
  expect(initialGlyph("e\u0301lodie")).toBe("E\u0301")
  expect(initials("李 明")).toBe("李明")
  expect(initials("👨‍👩‍👧‍👦 Exemple")).toBe("👨‍👩‍👧‍👦E")
  expect(initials(" ")).toBe("?")
  expect(initials("alice.martin@example.test")).toBe("AM")
})
