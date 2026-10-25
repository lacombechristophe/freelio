import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import prisma from "@/lib/prisma"
import { requestContext } from "@/lib/context"
import { readRecipientPage } from "@/lib/communications/recipient-reader"

describe.sequential("complete recipient directory on SQL", () => {
  let companyId: string, foreignId: string, selectedId: string, foreignContactId: string
  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: "Fictitious recipient directory" } })).id
    foreignId = (await prisma.company.create({ data: { name: "Foreign fictitious directory" } })).id
    const client = await prisma.client.create({ data: { companyId, name: "Pool Company Fiction" } })
    await prisma.contact.createMany({ data: Array.from({ length: 1001 }, (_, index) => ({ clientId: client.id, firstName: "Camille", lastName: "Fiction", email: `recipient${index}@example.test`, phone: "Private fixture field", role: "Private fixture role" })) })
    selectedId = (await prisma.contact.findFirstOrThrow({ where: { clientId: client.id, email: "recipient1000@example.test" } })).id
    await prisma.contact.createMany({ data: [null, ""].map(email => ({ clientId: client.id, firstName: "Unreachable", lastName: "Fiction", email })) })
    const foreign = await prisma.client.create({ data: { companyId: foreignId, name: "Foreign Company" } })
    foreignContactId = (await prisma.contact.create({ data: { clientId: foreign.id, firstName: "Foreign", lastName: "Secret", email: "foreign@example.test" } })).id
  })
  afterAll(async () => {
    await prisma.contact.deleteMany({ where: { client: { companyId: { in: [companyId, foreignId] } } } })
    await prisma.client.deleteMany({ where: { companyId: { in: [companyId, foreignId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignId] } } })
  })
  function scoped<T>(task: () => Promise<T>) {
    return requestContext.run({ companyId, userId: "fixture", role: "SALES", membershipId: "fixture", agencyIds: null, actionPermission: "automation.read" }, task)
  }
  it("pages all 1001 recipients in stable order without exposing private contact fields", async () => {
    await scoped(async () => {
      const expected = await prisma.contact.findMany({ where: { client: { companyId }, email: { not: null }, NOT: { email: "" } }, select: { id: true }, orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }] })
      const ids: string[] = []
      for (let page = 1; page <= 41; page++) {
        const result = await readRecipientPage(companyId, { page })
        expect(result.total).toBe(1001)
        expect(result.contacts.length).toBeLessThanOrEqual(25)
        ids.push(...result.contacts.map(contact => contact.id))
        expect(Object.keys(result.contacts[0]).sort()).toEqual(["client", "email", "firstName", "id", "lastName"])
      }
      expect(ids).toEqual(expected.map(contact => contact.id))
      expect(new Set(ids).size).toBe(1001)
      expect((await readRecipientPage(companyId, { page: 999 })).page).toBe(41)
    })
  })
  it("searches name, email and company over the whole directory", async () => {
    await scoped(async () => {
      expect((await readRecipientPage(companyId, { search: "CAMILLE" })).total).toBe(1001)
      expect((await readRecipientPage(companyId, { search: "fiction" })).total).toBe(1001)
      expect((await readRecipientPage(companyId, { search: "pool company" })).total).toBe(1001)
      const found = await readRecipientPage(companyId, { search: "recipient1000@", page: 50 })
      expect(found.contacts.map(contact => contact.id)).toEqual([selectedId])
      expect(found.page).toBe(1)
      expect((await readRecipientPage(companyId, { search: "no-match" })).contacts).toEqual([])
    })
  })
  it("preserves a selected recipient outside the search while refusing foreign IDs", async () => {
    await scoped(async () => {
      const result = await readRecipientPage(companyId, { search: "no-match", selectedId })
      expect(result.total).toBe(0)
      expect(result.selectedContact?.id).toBe(selectedId)
      expect((await readRecipientPage(companyId, { selectedId: foreignContactId })).selectedContact).toBeNull()
      expect((await readRecipientPage(foreignId)).total).toBe(0)
    })
  })
  it("rejects unbounded or malformed requests", async () => {
    for (const input of [{ page: 0 }, { page: 1.5 }, { page: 100001 }, { search: "x".repeat(201) }, { selectedId: "invalid" }]) {
      await expect(readRecipientPage(companyId, input)).rejects.toThrow()
    }
  })
})
