import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const mocks = vi.hoisted(() => ({ recurring: vi.fn(), maintenance: vi.fn(), cleanup: vi.fn(), reminders: vi.fn(), emails: vi.fn(), archives: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ default: { invoice: { updateMany: vi.fn(async () => ({ count: 0 })) }, recurringInvoice: { findMany: mocks.recurring }, maintenanceContract: { findMany: mocks.maintenance }, billingWebhookEvent: { deleteMany: mocks.cleanup } } }))
vi.mock("@/lib/finance/invoice-reminder-sender", () => ({ processDueInvoiceReminders: mocks.reminders }))
vi.mock("@/lib/communications/scheduled-emails", () => ({ processDueScheduledEmails: mocks.emails }))
vi.mock("@/lib/contracts/archive", () => ({ processDueContractArchives: mocks.archives }))
import { processScheduledBusinessJobs } from "@/lib/scheduling/business"

describe("business scheduling respects the database writer capability", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.maintenance.mockResolvedValue([]); mocks.cleanup.mockResolvedValue({ count: 0 })
    mocks.reminders.mockResolvedValue({ sent: 0 }); mocks.emails.mockResolvedValue({ sent: 0 }); mocks.archives.mockResolvedValue({ archived: 0 })
  })
  afterEach(() => vi.unstubAllEnvs())
  it("does not start another SQLite business job while the first one is pending", async () => {
    vi.stubEnv("DATABASE_URL", "file:./fictional-scheduler.db")
    let release!: (rows: never[]) => void
    mocks.recurring.mockImplementation(() => new Promise(resolve => { release = resolve }))
    const result = processScheduledBusinessJobs()
    await vi.waitFor(() => expect(mocks.recurring).toHaveBeenCalledOnce())
    for (const next of [mocks.maintenance, mocks.cleanup, mocks.reminders, mocks.emails, mocks.archives]) expect(next).not.toHaveBeenCalled()
    release([])
    await expect(result).resolves.toMatchObject({ recurringInvoices: { generated: 0 }, maintenanceVisits: { scheduled: 0 }, deletedBillingWebhookEvents: 0 })
    for (const next of [mocks.maintenance, mocks.cleanup, mocks.reminders, mocks.emails, mocks.archives]) expect(next).toHaveBeenCalledOnce()
  })
  it("keeps independent PostgreSQL jobs concurrent", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://fiction:fiction@localhost:5432/fiction")
    let release!: (rows: never[]) => void
    mocks.recurring.mockImplementation(() => new Promise(resolve => { release = resolve }))
    const result = processScheduledBusinessJobs()
    await vi.waitFor(() => expect(mocks.maintenance).toHaveBeenCalledOnce())
    expect(mocks.cleanup).toHaveBeenCalledOnce()
    release([])
    await expect(result).resolves.toMatchObject({ maintenanceVisits: { scheduled: 0 } })
  })
  it("propagates a SQLite job failure without starting later jobs or reporting success", async () => {
    vi.stubEnv("DATABASE_URL", "file:./fictional-scheduler.db")
    mocks.recurring.mockRejectedValue(new Error("Fictional scheduler outage"))
    await expect(processScheduledBusinessJobs()).rejects.toThrow("Fictional scheduler outage")
    expect(mocks.maintenance).not.toHaveBeenCalled()
    expect(mocks.cleanup).not.toHaveBeenCalled()
  })
})
