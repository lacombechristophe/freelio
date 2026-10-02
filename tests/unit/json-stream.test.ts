import { expect, it } from "vitest"
import { jsonResponseStream } from "@/lib/json-stream"
it("preserves the JSON representation and Unicode across streamed boundaries", async () => {
  const value = { date: new Date("2026-09-30"), omitted: undefined, rows: [{ label: "a".repeat(32_760) + "🧪é".repeat(30_000), nullable: null }], amount: 1234 }
  expect(await new Response(jsonResponseStream(value)).text()).toBe(JSON.stringify(value))
})
