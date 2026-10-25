import { createHash } from "node:crypto"

// Called only by the guarded disposable browser recipe; never an access token for a real tenant.
export function fictionalPortalToken(surface, kind) {
  return createHash("sha256").update(`fictional-portal-relations-${surface}-${kind}`).digest("base64url")
}

export async function seedPortalRelations(prisma) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional portal relations ${surface}` } })
    const foreign = await prisma.company.create({ data: { name: `Fictional foreign portal relations ${surface}` } })
    const own = await prisma.client.create({ data: { id: `cportalrelationclient${surface}`, companyId: company.id, name: "FICTIONAL-PORTAL-OWN-PARTY" } })
    const other = await prisma.client.create({ data: { companyId: foreign.id, name: "FICTIONAL-PORTAL-FOREIGN-PARTY" } })
    const contact = await prisma.contact.create({ data: { clientId: other.id, firstName: "FICTIONAL-FOREIGN", lastName: "PORTAL-CONTACT" } })
    for (const kind of ["own", "foreignclient", "foreigncontact"]) {
      await prisma.clientPortalAccess.create({ data: {
        id: `cportalrelation${kind}${surface}`, companyId: company.id,
        clientId: kind === "foreignclient" ? other.id : own.id,
        contactId: kind === "foreigncontact" ? contact.id : null,
        tokenHash: createHash("sha256").update(fictionalPortalToken(surface, kind)).digest("hex"),
        expiresAt: new Date(Date.now() + 24 * 3_600_000),
      } })
    }
  }
}
