import fs from "node:fs/promises"
import { createHash } from "node:crypto"

// Inventory of declared lockfile metadata, not a legal assessment of distribution.
const bytes = await fs.readFile("package-lock.json")
const lock = JSON.parse(bytes.toString("utf8"))
const packages = Object.entries(lock.packages).filter(([location]) => location).map(([location, metadata]) => ({
  name: metadata.name || location.split("node_modules/").at(-1),
  version: metadata.version,
  location,
  license: metadata.license || "UNKNOWN",
  developmentOnly: metadata.dev === true,
  optional: metadata.optional === true,
  resolved: metadata.resolved,
  integrity: metadata.integrity,
}))
const licenses = {}
for (const entry of packages) licenses[entry.license] = (licenses[entry.license] || 0) + 1
console.log(JSON.stringify({
  schema: "freelio.dependency-inventory.v1", generatedAt: new Date().toISOString(),
  lockfileSha256: createHash("sha256").update(bytes).digest("hex"), packageCount: packages.length, licenses,
  manualReview: packages.filter(entry => /UNKNOWN|UNLICENSED|GPL|MPL|CC-BY/.test(entry.license)),
  exclusions: ["Licence du code propre", "Assets et polices", "Paquets système de l’image et Chromium", "Services et images PostgreSQL/Redis", "Texte effectif des licences et obligations de redistribution"],
  packages,
}, null, 2))
