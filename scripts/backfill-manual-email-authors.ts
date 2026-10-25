import prisma from "../src/lib/prisma"
import { normalizeLegacyManualAuthors } from "../src/lib/communications/manual-recovery"

// Explicit maintenance command, never run implicitly by a visitor or a build.
if (!process.argv.includes("--apply")) throw new Error("Ajouter --apply pour normaliser les auteurs historiques validables")
async function main() {
  try { console.log(JSON.stringify(await normalizeLegacyManualAuthors())) }
  finally { await prisma.$disconnect() }
}
main().catch(() => { console.error("Normalisation interrompue ; les compteurs ne prouvent pas un achèvement"); process.exitCode = 1 })
