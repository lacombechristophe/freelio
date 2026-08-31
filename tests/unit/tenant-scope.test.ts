import { readFileSync } from "node:fs"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { requestContext } from "@/lib/context"
import prisma from "@/lib/prisma"
import { COMPANY_RELATION_SCOPED_MODELS, COMPANY_SCOPED_MODELS, COMPANY_SCOPE_SCHEMA_EXCEPTIONS, GLOBAL_SCOPE_SCHEMA_EXCEPTIONS } from "@/lib/tenant-scope"

function directCompanyModels(schema: string) {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .filter((match) => /^\s*companyId\s+String/m.test(match[2]))
    .map((match) => match[1])
    .sort()
}

describe("tenant scope architecture", () => {
  it("scopes every model that owns a direct companyId", () => {
    const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8")
    const expected = directCompanyModels(schema).filter((model) => !COMPANY_SCOPE_SCHEMA_EXCEPTIONS.has(model as "User"))

    expect([...COMPANY_SCOPED_MODELS].sort()).toEqual(expected)
  })

  it("keeps schema exceptions explicit and minimal", () => {
    expect([...COMPANY_SCOPE_SCHEMA_EXCEPTIONS]).toEqual(["User"])
  })

  it("classifies every schema model as direct, relational or intentionally global", () => {
    const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8")
    const models = [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1]).sort()
    const classified = new Set([...COMPANY_SCOPED_MODELS, ...COMPANY_RELATION_SCOPED_MODELS, ...GLOBAL_SCOPE_SCHEMA_EXCEPTIONS])
    expect([...classified].sort()).toEqual(models)
  })
})

describe("tenant-scoped Prisma boundary", () => {
  const firstCompanyId = "tenant-scope-company-first"
  const secondCompanyId = "tenant-scope-company-second"
  const firstClientId = "tenant-scope-client-first"
  const secondClientId = "tenant-scope-client-second"

  beforeAll(async () => {
    await prisma.company.createMany({
      data: [
        { id: firstCompanyId, name: "Tenant scope first" },
        { id: secondCompanyId, name: "Tenant scope second" },
      ],
    })
    await prisma.client.createMany({
      data: [
        { id: firstClientId, companyId: firstCompanyId, name: "Visible client" },
        { id: secondClientId, companyId: secondCompanyId, name: "Hidden client" },
      ],
    })
    await prisma.contact.createMany({
      data: [
        { id: "tenant-scope-contact-first", clientId: firstClientId, firstName: "Visible", lastName: "Contact" },
        { id: "tenant-scope-contact-second", clientId: secondClientId, firstName: "Hidden", lastName: "Contact" },
      ],
    })
  })

  afterAll(async () => {
    await prisma.client.deleteMany({ where: { companyId: { in: [firstCompanyId, secondCompanyId] } } })
    await prisma.company.deleteMany({ where: { id: { in: [firstCompanyId, secondCompanyId] } } })
  })

  it("scopes counts and throwing reads, and pins every write to the active company", async () => {
    await requestContext.run(
      {
        userId: "tenant-scope-user",
        companyId: firstCompanyId,
        membershipId: "tenant-scope-membership",
        role: "OWNER",
        agencyIds: null,
        actionPermission: "crm.write",
      },
      async () => {
        await expect(prisma.client.count()).resolves.toBe(1)
        await expect(prisma.client.findUniqueOrThrow({ where: { id: secondClientId } })).rejects.toMatchObject({ code: "P2025" })
        await expect(prisma.contact.count()).resolves.toBe(1)
        await expect(prisma.contact.findUnique({ where: { id: "tenant-scope-contact-second" } })).resolves.toBeNull()
        await expect(
          prisma.contact.findFirst({
            where: { client: { id: secondClientId } },
            select: { id: true },
          }),
        ).resolves.toBeNull()

        const created = await prisma.client.create({
          data: { id: "tenant-scope-client-created", companyId: secondCompanyId, name: "Pinned create" },
        })
        expect(created.companyId).toBe(firstCompanyId)

        const updated = await prisma.client.update({
          where: { id: created.id },
          data: { companyId: secondCompanyId, name: "Pinned update" },
        })
        expect(updated.companyId).toBe(firstCompanyId)

        const upserted = await prisma.client.upsert({
          where: { id: "tenant-scope-client-upserted" },
          create: { id: "tenant-scope-client-upserted", companyId: secondCompanyId, name: "Pinned upsert" },
          update: { companyId: secondCompanyId },
        })
        expect(upserted.companyId).toBe(firstCompanyId)
      },
    )
  })
})
