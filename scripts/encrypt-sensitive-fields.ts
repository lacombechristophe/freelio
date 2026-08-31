import prisma from "../src/lib/prisma"
import { encrypt, isEncrypted } from "../src/lib/crypto"

async function main() {
  const companies = await prisma.company.findMany({ where: { iban: { not: null } }, select: { id: true, iban: true } })
  let migrated = 0
  for (const company of companies) {
    if (!company.iban || isEncrypted(company.iban)) continue
    await prisma.company.update({ where: { id: company.id }, data: { iban: encrypt(company.iban) } })
    migrated += 1
  }
  console.log(`Sensitive-field migration complete: ${migrated} company record(s) updated.`)
}

main()
  .catch((error) => {
    console.error("Sensitive-field migration failed", error instanceof Error ? error.message : "unknown")
    process.exitCode = 1
  })
  .finally(async () => { await prisma.$disconnect() })
