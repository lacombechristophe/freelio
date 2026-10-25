import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { PDFDocument } from "pdf-lib"
import importedPrisma from "../src/lib/prisma.ts"
import { prepareContractSnapshot, sealContractSnapshot, processDueContractArchives, readContractArchive } from "../src/lib/contracts/archive.ts"

// Synthetic signature fixture, never a real signer or the public signing API.
const database = new URL(process.env.DATABASE_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || !/^\/freelio_demo_linux_[a-f0-9]+$/.test(database.pathname)) throw Error("Recette Linux fictive explicite requise")
// tsx exposes this TypeScript default through a CommonJS namespace in the image.
const prisma = typeof importedPrisma.$disconnect === "function" ? importedPrisma : importedPrisma.default
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jskYAAAAASUVORK5CYII="
try {
  assert.notEqual(process.getuid?.(), 0, "Utilisateur runtime sans privilèges requis")
  const client = await prisma.client.findFirstOrThrow({ where: { company: { email: "direction@atelier-des-bassins.example.test" } } })
  const contract = await prisma.contract.create({ data: { companyId: client.companyId, clientId: client.id, number: "LINUX-FICTION-ARCHIVE", title: "Fictional frozen Linux agreement", content: "<p>{{client.name}} — {{entreprise.name}}</p>", status: "SENT" }, include: { company: true, client: { include: { contacts: true } } } })
  const captured = await prepareContractSnapshot(contract), signedAt = new Date()
  const signature = { signerName: "Fictional Linux signer", signerEmail: "signer@example.test", signedAt, canvasData: png }
  const signedDocument = sealContractSnapshot(captured.snapshot, captured.documentHash, signature)
  await prisma.$transaction(async tx => {
    await tx.contractSignature.create({ data: { contractId: contract.id, ...signature, integrityHash: createHash("sha256").update("synthetic Linux signature fixture").digest("hex") } })
    await tx.contract.update({ where: { id: contract.id }, data: { status: "SIGNED", signedDocument, archiveStatus: "PENDING", archiveNextAttemptAt: signedAt } })
  })
  assert.deepEqual(await processDueContractArchives({ companyId: client.companyId }), { examined: 1, generated: 1, failed: 0 })
  const stored = await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })
  assert.equal(stored.archiveStatus, "READY")
  const archive = await readContractArchive(stored), document = await PDFDocument.load(archive.pdf)
  assert.ok(document.getPageCount() >= 1)
  assert.equal(archive.documentHash, captured.documentHash)
  assert.ok(archive.html.includes(signature.signerName))
  assert.deepEqual(await processDueContractArchives({ companyId: client.companyId }), { examined: 0, generated: 0, failed: 0 })
  assert.deepEqual((await readContractArchive(await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } }))).pdf, archive.pdf)
  assert.equal(await prisma.contractSignature.count({ where: { contractId: contract.id } }), 1)
  console.log(JSON.stringify({ schema: "freelio.runtime-contract-archive.v1", archive: "READY", attempts: stored.archiveAttempts, pdfHash: stored.pdfHash, bytes: archive.pdf.length, pages: document.getPageCount(), replay: "unchanged", signatureFixture: "synthetic", uid: process.getuid?.() }))
} finally {
  await prisma.$disconnect()
}
