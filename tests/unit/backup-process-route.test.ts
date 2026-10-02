import { beforeEach, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ process: vi.fn(), authorized: vi.fn() }))
vi.mock("@/lib/backup-scheduler", () => ({ processDueCompanyBackups: mocks.process }))
vi.mock("@/lib/cron-auth", () => ({ cronRequestIsAuthorized: mocks.authorized }))
import { POST } from "@/app/api/backup/process/route"
beforeEach(() => { vi.resetAllMocks(); mocks.authorized.mockReturnValue(true) })
it("refuses an unauthenticated processor request without running a backup", async () => {
  mocks.authorized.mockReturnValue(false)
  expect((await POST(new Request("https://example.test/api/backup/process"))).status).toBe(401)
  expect(mocks.process).not.toHaveBeenCalled()
})
it.each([{ selected: 7, stored: 6, failed: 1, remaining: 1 }, { selected: 3, stored: 3, failed: 0, remaining: 4 }])("reports a failed or incomplete daily backup pass as unavailable", async summary => {
  mocks.process.mockResolvedValue(summary)
  const response = await POST(new Request("https://example.test/api/backup/process"))
  expect(response.status).toBe(503)
  expect(await response.json()).toMatchObject({ success: false, summary })
})
