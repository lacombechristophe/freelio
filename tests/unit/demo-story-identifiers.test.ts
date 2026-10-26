import { describe, expect, it } from "vitest"
import { z } from "zod"
import { demoStoryId } from "@/lib/demo-stories"

describe("synthetic dossier identifiers", () => {
  it.each(["vente-opportunity", "chantier-project", "sav-ticket"])("satisfies the detail route's CUID contract for %s", key => {
    const id = demoStoryId("fictional-company", key)
    expect(z.string().cuid().parse(id)).toBe(id)
  })
})
