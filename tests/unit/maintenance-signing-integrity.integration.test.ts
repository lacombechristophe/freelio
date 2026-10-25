import { createDatabaseClient } from "@/lib/database-client"
import { createHash, randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
const session = vi.hoisted(() => ({ userId: "", companyId: "" }))
vi.mock("server-only", () => ({}))
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: session.userId }, companyId: session.companyId }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-real-ip": "198.51.100.25", "user-agent": "Fictional maintenance signer" }) }))
vi.mock("@/lib/rate-limit", () => ({ signatureRateLimit: { limit: async () => ({ success: true }) } }))
import { createMaintenanceRenewalProposal, deleteContract, getPublicContractForSigning, signContractPublic, updateContractStatus } from "@/actions/contrats"
import { getOperationsDashboard, getOperationsMaintenanceDirectory, renewMaintenanceContract } from "@/actions/operations"
import { readSignedContractDocument } from "@/lib/contracts/archive"
import * as archives from "@/lib/contracts/archive"
import { buildBackupPayload } from "@/lib/backup"
import { verifyReversibilityExport } from "@/lib/backup-integrity"

const db = createDatabaseClient(), png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jskYAAAAASUVORK5CYII="
const hash = (value: string | null) => value == null ? null : createHash("sha256").update(value).digest("hex")
describe.sequential("Maintenance signature and subsequent term preserve the agreed economics", () => {
  let sourceId: string, proposalId: string, membershipId: string
  const foreignCompanies: string[] = []
  async function displayed() { return (await getOperationsMaintenanceDirectory()).items.find(row => row.id === sourceId)! }
  async function sent() {
    const result = await updateContractStatus(proposalId, "SENT"), token = result.signingPath!.split("/").at(-1)!, shown = (await getPublicContractForSigning(token))!
    return { token, shown, signature: { documentHash: shown.documentHash, signerName: "Fictional maintenance signer", signerEmail: "signer@example.test", canvasData: png } }
  }
  async function snapshot() {
    const contracts = await db.contract.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } })
    const tokens = await db.contractSigningToken.findMany({ where: { contract: { companyId: session.companyId } }, orderBy: { id: "asc" } })
    return { contracts: contracts.map(row => ({ ...row, signedDocument: hash(row.signedDocument) })), tokens: tokens.map(row => ({ ...row, documentSnapshot: hash(row.documentSnapshot) })),
      maintenance: await db.maintenanceContract.findMany({ where: { companyId: session.companyId }, orderBy: { id: "asc" } }),
      signatures: await db.contractSignature.findMany({ where: { contract: { companyId: session.companyId } }, orderBy: { id: "asc" } }),
      equipmentLinks: await db.maintenanceContractEquipment.findMany({ where: { contract: { companyId: session.companyId } }, orderBy: [{ contractId: "asc" }, { equipmentId: "asc" }] }), audit: await db.auditLog.count({ where: { userId: session.userId } }) }
  }
  beforeEach(async () => {
    session.companyId = (await db.company.create({ data: { name: "Fictional maintenance agreement", isTvaApplicable: true } })).id
    session.userId = (await db.user.create({ data: { email: `maintenance-signer-${randomUUID()}@example.test`, companyId: session.companyId } })).id
    membershipId = (await db.membership.create({ data: { companyId: session.companyId, userId: session.userId, role: "OWNER", status: "ACTIVE" } })).id
    const agency = await db.agency.create({ data: { companyId: session.companyId, code: "SIGN", name: "Fictional signature agency" } })
    await db.agencyMembership.create({ data: { membershipId, agencyId: agency.id } })
    const client = await db.client.create({ data: { companyId: session.companyId, name: "Fictional maintenance client", contacts: { create: { firstName: "Fictional", lastName: "Signer", email: "signer@example.test", isPrimary: true } } } })
    const site = await db.customerSite.create({ data: { companyId: session.companyId, clientId: client.id, agencyId: agency.id, label: "Fictional signed site", address1: "Fictional address" } })
    sourceId = (await db.maintenanceContract.create({ data: { companyId: session.companyId, clientId: client.id, siteId: site.id, number: "FICTIONAL-TERM", label: "Fictional maintenance", startDate: new Date("2030-01-01"), endDate: new Date("2030-12-31"), priceCents: 10000, indexationRate: 2, renewalStatus: "UPCOMING" } })).id
    const source = await displayed(); proposalId = (await createMaintenanceRenewalProposal(sourceId, source.renewalRevision)).id
  })
  afterEach(async () => {
    vi.restoreAllMocks(); vi.unstubAllEnvs()
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_status_audit_failure"')
    else { await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fictional_maintenance_status_audit_failure" ON "AuditLog"'); await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS fictional_maintenance_status_audit_failure()') }
    await db.maintenanceContract.updateMany({ where: { companyId: session.companyId }, data: { currentRenewalProposalId: null, acceptedRenewalProposalId: null } })
    await db.contractSignature.deleteMany({ where: { contract: { companyId: session.companyId } } }); await db.contractSigningToken.deleteMany({ where: { contract: { companyId: session.companyId } } })
    await db.contract.deleteMany({ where: { companyId: session.companyId } }); await db.maintenanceContract.deleteMany({ where: { companyId: session.companyId } })
    await db.equipment.deleteMany({ where: { companyId: session.companyId } }); await db.customerSite.deleteMany({ where: { companyId: session.companyId } }); await db.contact.deleteMany({ where: { client: { companyId: session.companyId } } }); await db.client.deleteMany({ where: { companyId: session.companyId } })
    await db.auditLog.deleteMany({ where: { userId: session.userId } }); await db.company.delete({ where: { id: session.companyId } }); await db.user.delete({ where: { id: session.userId } })
    for (const companyId of foreignCompanies.splice(0)) { await db.contract.deleteMany({ where: { companyId } }); await db.client.deleteMany({ where: { companyId } }); await db.company.delete({ where: { id: companyId } }) }
  })
  afterAll(async () => { await db.$disconnect() })
  it("signs a coherent €102 proposal and creates a €102 term", async () => {
    const prepared = await sent(); expect(prepared.shown.content).toMatch(/102[^0-9]*00[^<]*HT/)
    expect(prepared.shown.content).toContain("TVA applicable : 20 %"); expect(prepared.shown.content).toContain("Délai de paiement : 30 jours")
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    const source = await displayed(), result = await renewMaintenanceContract(sourceId, source.renewalRevision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).priceCents).toBe(10200)
  })
  it("refuses a proposal sent after its underlying price changed", async () => {
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { priceCents: 30000 } }); const before = await snapshot()
    await expect(updateContractStatus(proposalId, "SENT")).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("refuses signature after the maintenance price changed without consuming the token", async () => {
    const prepared = await sent(); await db.maintenanceContract.update({ where: { id: sourceId }, data: { priceCents: 30000 } }); const before = await snapshot()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("refuses a €306 term after a €102 signature and preserves that signature", async () => {
    const prepared = await sent(); expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { priceCents: 30000 } }); const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(sourceId, source.renewalRevision)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("accepts harmless internal notes without replacing the signed conditions", async () => {
    const prepared = await sent(); await db.maintenanceContract.update({ where: { id: sourceId }, data: { renewalNotes: "Fictional internal note" } })
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    const source = await displayed(), result = await renewMaintenanceContract(sourceId, source.renewalRevision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).priceCents).toBe(10200)
  })
  it("rolls back sent status, token and proposed decision when SQL refuses their audit", async () => {
    await refuseAudit("UPDATE_CONTRACT_STATUS")
    const before = await snapshot(), result = await updateContractStatus(proposalId, "SENT").then(() => null, error => error)
    expect(await snapshot()).toEqual(before); expect(result).toBeInstanceOf(Error)
  })
  it("lets Commercial prepare the signature link without general operational edits", async () => {
    await db.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const prepared = await sent(); expect(prepared.shown.content).toMatch(/102[^0-9]*00[^<]*HT/)
  })
  async function refuseAudit(action: string) {
    expect(session.userId).toMatch(/^[a-z0-9]+$/); expect(action).toMatch(/^[A-Z_]+$/)
    if (process.env.DATABASE_URL?.startsWith("file:")) await db.$executeRawUnsafe(`CREATE TRIGGER "fictional_maintenance_status_audit_failure" BEFORE INSERT ON "AuditLog" WHEN NEW."userId" = '${session.userId}' AND NEW."action" = '${action}' BEGIN SELECT RAISE(ABORT, 'Fictional maintenance audit failure'); END`)
    else {
      await db.$executeRawUnsafe(`CREATE FUNCTION fictional_maintenance_status_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."userId" = '${session.userId}' AND NEW."action" = '${action}' THEN RAISE EXCEPTION 'Fictional maintenance audit failure'; END IF; RETURN NEW; END; $$`)
      await db.$executeRawUnsafe('CREATE TRIGGER "fictional_maintenance_status_audit_failure" BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fictional_maintenance_status_audit_failure()')
    }
  }
  it.each([{ indexationRate: 5 }, { noticeDays: 90 }, { frequency: "MONTHLY" }, { tvaRate: 10 }, { invoiceDueDays: 60 }, { autoInvoice: true }])("refuses changed structured conditions %j without consuming the signature", async data => {
    const prepared = await sent(); await db.maintenanceContract.update({ where: { id: sourceId }, data }); const before = await snapshot()
    expect(await getPublicContractForSigning(prepared.token)).toBeNull()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("requires a new agreement after the company tax policy changes", async () => {
    const prepared = await sent(); await db.company.update({ where: { id: session.companyId }, data: { isTvaApplicable: false } }); const before = await snapshot()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("does not overwrite a declined decision with a signature", async () => {
    const prepared = await sent(); await db.maintenanceContract.update({ where: { id: sourceId }, data: { renewalStatus: "DECLINED" } }); const before = await snapshot()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("does not sign an archived site", async () => {
    const prepared = await sent(), source = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })
    await db.customerSite.update({ where: { id: source.siteId }, data: { archivedAt: new Date() } }); const before = await snapshot()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("does not sign a changed equipment perimeter", async () => {
    const prepared = await sent(), source = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })
    const equipment = await db.equipment.create({ data: { companyId: session.companyId, siteId: source.siteId, label: "Fictional additional equipment" } })
    await db.maintenanceContractEquipment.create({ data: { contractId: sourceId, equipmentId: equipment.id } }); const before = await snapshot()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("binds the exact stored terms even if their timestamp is kept", async () => {
    const prepared = await sent(), proposal = await db.contract.findUniqueOrThrow({ where: { id: proposalId } })
    await db.contract.update({ where: { id: proposalId }, data: { maintenanceRenewalTerms: `${proposal.maintenanceRenewalTerms} `, updatedAt: proposal.updatedAt } }); const before = await snapshot()
    expect(await getPublicContractForSigning(prepared.token)).toBeNull()
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before)
  })
  it("keeps frozen identities and economic terms after harmless identity edits", async () => {
    const prepared = await sent(), source = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })
    await db.client.update({ where: { id: source.clientId }, data: { name: "Fictional updated client identity" } }); await db.company.update({ where: { id: session.companyId }, data: { name: "Fictional updated company identity" } })
    expect((await getPublicContractForSigning(prepared.token))?.clientName).toBe("Fictional maintenance client")
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    const proposal = await db.contract.findUniqueOrThrow({ where: { id: proposalId } }), document = readSignedContractDocument(proposal.signedDocument, proposal)
    expect(document.maintenanceRenewalTerms).toBe(proposal.maintenanceRenewalTerms)
    expect(document.html).toContain("Fictional maintenance client"); expect(document.html).not.toContain("Fictional updated client identity")
  })
  it("replaces a pending proposal and revokes its link without erasing its document", async () => {
    const prepared = await sent(), old = await db.contract.findUniqueOrThrow({ where: { id: proposalId } }); const source = await displayed()
    const replacement = await createMaintenanceRenewalProposal(sourceId, source.renewalRevision, proposalId)
    expect(replacement.id).not.toBe(proposalId); expect(await getPublicContractForSigning(prepared.token)).toBeNull()
    expect(await db.contract.findUniqueOrThrow({ where: { id: proposalId } })).toMatchObject({ content: old.content, status: "EXPIRED", maintenanceRenewalTerms: old.maintenanceRenewalTerms })
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })).currentRenewalProposalId).toBe(replacement.id)
  })
  it("serializes replacement retries into one new proposal", async () => {
    const source = await displayed(), results = await Promise.all([createMaintenanceRenewalProposal(sourceId, source.renewalRevision, proposalId), createMaintenanceRenewalProposal(sourceId, source.renewalRevision, proposalId)])
    expect(results[0].id).toBe(results[1].id); expect(await db.contract.count({ where: { maintenanceContractId: sourceId } })).toBe(2)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })).currentRenewalProposalId).toBe(results[0].id)
  })
  it("accepts a new price only after a new signature and preserves the first signed receipt", async () => {
    const first = await sent(); expect(await signContractPublic(first.token, first.signature)).toMatchObject({ ok: true })
    const original = await db.contract.findUniqueOrThrow({ where: { id: proposalId } })
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { priceCents: 30000 } }); const changed = await displayed()
    const replacement = await createMaintenanceRenewalProposal(sourceId, changed.renewalRevision, proposalId)
    const unaccepted = await displayed(); await expect(renewMaintenanceContract(sourceId, unaccepted.renewalRevision)).rejects.toThrow()
    proposalId = replacement.id
    const second = await sent(); expect(second.shown.content).toMatch(/306[^0-9]*00[^<]*HT/)
    expect(await signContractPublic(second.token, second.signature)).toMatchObject({ ok: true })
    const accepted = await displayed(), renewed = await renewMaintenanceContract(sourceId, accepted.renewalRevision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: renewed.id } })).priceCents).toBe(30600)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })).acceptedRenewalProposalId).toBe(replacement.id)
    expect(await db.contract.findUniqueOrThrow({ where: { id: original.id } })).toEqual(original)
  })
  it("keeps expiration, current proposal and token atomic when SQL rejects their audit", async () => {
    await sent(); await refuseAudit("UPDATE_CONTRACT_STATUS"); const before = await snapshot()
    await expect(updateContractStatus(proposalId, "EXPIRED")).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("keeps replacement, token revocation and both documents atomic when SQL rejects creation audit", async () => {
    await sent(); const source = await displayed(); await refuseAudit("CREATE_MAINTENANCE_RENEWAL_PROPOSAL"); const before = await snapshot()
    await expect(createMaintenanceRenewalProposal(sourceId, source.renewalRevision, proposalId)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("keeps deletion and its limited source cleanup atomic when SQL rejects their audit", async () => {
    await sent(); await refuseAudit("DELETE_CONTRACT"); const before = await snapshot()
    await expect(deleteContract(proposalId)).rejects.toThrow(); expect(await snapshot()).toEqual(before)
  })
  it("lets Commercial classify a historical draft and prepare a captured successor", async () => {
    await db.contract.update({ where: { id: proposalId }, data: { maintenanceRenewalTerms: null } })
    await db.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    await expect(updateContractStatus(proposalId, "SENT")).rejects.toThrow("Conditions historiques indisponibles")
    await updateContractStatus(proposalId, "EXPIRED")
    const source = await displayed(), replacement = await createMaintenanceRenewalProposal(sourceId, source.renewalRevision)
    expect(replacement.id).not.toBe(proposalId); expect((await db.contract.findUniqueOrThrow({ where: { id: proposalId } })).status).toBe("EXPIRED")
  })
  it("lets Commercial delete a pending proposal without changing operational terms", async () => {
    await sent(); await db.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const source = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } }); await deleteContract(proposalId)
    const after = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })
    expect(after).toEqual({ ...source, currentRenewalProposalId: null, renewalStatus: "UPCOMING", updatedAt: after.updatedAt })
    expect(await db.contract.count({ where: { id: proposalId } })).toBe(0)
  })
  it("never expires or deletes an actual signed receipt", async () => {
    const prepared = await sent(); expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true }); const before = await snapshot()
    await expect(updateContractStatus(proposalId, "EXPIRED")).rejects.toThrow("immuable")
    await expect(deleteContract(proposalId)).rejects.toThrow("signé"); expect(await snapshot()).toEqual(before)
  })
  it("does not reconstruct missing historical signed conditions from today's tariff", async () => {
    await db.contract.update({ where: { id: proposalId }, data: { status: "SIGNED", maintenanceRenewalTerms: null } })
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { currentRenewalProposalId: null, acceptedRenewalProposalId: null, renewalStatus: "ACCEPTED" } })
    const source = await displayed(), before = await snapshot()
    await expect(renewMaintenanceContract(sourceId, source.renewalRevision)).rejects.toThrow("Conditions historiques indisponibles"); expect(await snapshot()).toEqual(before)
  })
  it("rechecks current agencies after capture preparation", async () => {
    await db.membership.update({ where: { id: membershipId }, data: { role: "SALES" } })
    const original = archives.prepareContractSnapshot
    vi.spyOn(archives, "prepareContractSnapshot").mockImplementationOnce(async (...args) => { const result = await original(...args); await db.agencyMembership.deleteMany({ where: { membershipId } }); return result })
    const before = await snapshot(); await expect(updateContractStatus(proposalId, "SENT")).rejects.toThrow("introuvable"); expect(await snapshot()).toEqual(before)
  })
  it("refuses a foreign accepted-proposal pointer without exposing or modifying it", async () => {
    const source = await displayed(), foreign = await db.company.create({ data: { name: "FOREIGN-AGREEMENT-COMPANY" } }); foreignCompanies.push(foreign.id)
    const client = await db.client.create({ data: { companyId: foreign.id, name: "FOREIGN-AGREEMENT-CLIENT" } })
    const agreement = await db.contract.create({ data: { companyId: foreign.id, clientId: client.id, number: "FOREIGN-AGREEMENT", title: "FOREIGN-AGREEMENT", content: "FOREIGN-AGREEMENT", status: "SIGNED" } })
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { acceptedRenewalProposalId: agreement.id, renewalStatus: "ACCEPTED" } }); const before = await snapshot()
    await expect(renewMaintenanceContract(sourceId, source.renewalRevision)).rejects.toThrow("introuvable"); expect(await snapshot()).toEqual(before)
    expect(await db.contract.findUniqueOrThrow({ where: { id: agreement.id } })).toEqual(agreement)
  })
  it("exports the structured conditions and both proposal references for controlled recovery", async () => {
    const prepared = await sent(); expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    const exported = await buildBackupPayload(session.userId, session.companyId), verified = verifyReversibilityExport(exported)
    expect(verified.ok).toBe(true)
    const proposal = exported.tables.find(table => table.model === "Contract")!.rows.find(row => row.id === proposalId)!
    const source = exported.tables.find(table => table.model === "MaintenanceContract")!.rows.find(row => row.id === sourceId)!
    expect(proposal.maintenanceRenewalTerms).toBe((await db.contract.findUniqueOrThrow({ where: { id: proposalId } })).maintenanceRenewalTerms)
    expect(source.currentRenewalProposalId).toBe(proposalId); expect(source.acceptedRenewalProposalId).toBe(proposalId)
  })
  it.each(["currentRenewalProposalId", "acceptedRenewalProposalId"] as const)("does not expose an internal %s pointing to another agency", async field => {
    const source = await db.maintenanceContract.findUniqueOrThrow({ where: { id: sourceId } })
    const agency = await db.agency.create({ data: { companyId: session.companyId, code: "OTHER", name: "Fictional other agency" } })
    const site = await db.customerSite.create({ data: { companyId: session.companyId, clientId: source.clientId, agencyId: agency.id, label: "Fictional other site", address1: "Fictional address" } })
    const other = await db.maintenanceContract.create({ data: { companyId: session.companyId, clientId: source.clientId, siteId: site.id, number: "OTHER-TERM", label: "Fictional other term", startDate: source.startDate, endDate: source.endDate } })
    const proposal = await db.contract.create({ data: { companyId: session.companyId, clientId: source.clientId, maintenanceContractId: other.id, number: "OTHER-PROPOSAL", title: "Fictional other proposal", kind: "MAINTENANCE_RENEWAL", content: "Fictional other agency" } })
    await db.maintenanceContract.update({ where: { id: sourceId }, data: { [field]: proposal.id } })
    await db.membership.update({ where: { id: membershipId }, data: { role: "OPERATIONS" } })
    const directory = await getOperationsMaintenanceDirectory(), dashboard = await getOperationsDashboard()
    for (const items of [directory.items, dashboard.contracts]) {
      const shown = items.find(row => row.id === sourceId)
      expect(shown).toBeDefined(); expect(shown).not.toHaveProperty(field)
      expect(JSON.stringify(items)).not.toContain(proposal.id)
    }
  })
  it("keeps a valid captured earlier wording without rebuilding it from today's renderer", async () => {
    const proposal = await db.contract.findUniqueOrThrow({ where: { id: proposalId } }), content = `${proposal.content}<p>Fictional prior template wording.</p>`
    const terms = { ...JSON.parse(proposal.maintenanceRenewalTerms!), bodySha256: createHash("sha256").update(content).digest("hex") }
    await db.contract.update({ where: { id: proposalId }, data: { content, maintenanceRenewalTerms: JSON.stringify(terms) } })
    const prepared = await sent(); expect(prepared.shown.content).toContain("Fictional prior template wording.")
    expect(await signContractPublic(prepared.token, prepared.signature)).toMatchObject({ ok: true })
    const source = await displayed(), result = await renewMaintenanceContract(sourceId, source.renewalRevision)
    expect((await db.maintenanceContract.findUniqueOrThrow({ where: { id: result.id } })).priceCents).toBe(10200)
  })
})
