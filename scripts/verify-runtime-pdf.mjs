import assert from "node:assert/strict"
import { PDFDocument } from "pdf-lib"
import fs from "node:fs"
import path from "node:path"
import { generatePdfFromHtml } from "../src/lib/pdf/generator.ts"

// No database fixture, upload or provider call: only a local browser render.
if (process.platform === "linux") {
  assert.notEqual(process.getuid(), 0, "Utilisateur runtime sans privilèges requis")
  for (const directory of ["prisma", "src", "scripts", "public"]) {
    for (const filename of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
      if (!filename.isFile()) continue
      assert.ok(!/^(\.env|demo-access\.json$|recipe-access\.json$)|\.db(?:$|-)/i.test(filename.name), `Fichier privé exclu : ${path.join(directory, filename.name)}`)
    }
  }
}
const bytes = await generatePdfFromHtml('<!doctype html><html lang="fr"><head><meta charset="utf-8"></head><body><h1>Freelio — recette fictive</h1><p>Rendu Chromium dans le runtime de livraison.</p></body></html>')
assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-")
const document = await PDFDocument.load(bytes)
assert.equal(document.getPageCount(), 1)
console.log(JSON.stringify({ schema: "freelio.runtime-pdf.v1", node: process.version, bytes: bytes.length, pages: document.getPageCount() }))
