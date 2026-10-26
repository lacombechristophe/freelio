import { readFile } from "node:fs/promises"
import path from "node:path"

// These packages prepare the database and start the local demo. Checking their
// manifests does not load native bindings, install packages or open a database.
const runtimePackages = [
  "next", "react", "react-dom", "prisma", "@prisma/client",
  "@prisma/adapter-better-sqlite3", "better-sqlite3", "tsx",
]

export async function assertDemoDependencies(source) {
  let lock
  try {
    lock = JSON.parse(await readFile(path.join(source, "package-lock.json"), "utf8"))
  } catch {
    throw new Error("package-lock.json absent ou illisible. Restaurez le lockfile du projet avant de préparer la démo.")
  }

  const mismatches = []
  for (const name of runtimePackages) {
    const expected = lock?.packages?.[`node_modules/${name}`]?.version
    if (typeof expected !== "string" || !expected) {
      throw new Error(`Version de ${name} absente du lockfile. Restaurez le lockfile du projet avant de préparer la démo.`)
    }
    let installed
    try {
      const manifest = JSON.parse(await readFile(path.join(source, "node_modules", name, "package.json"), "utf8"))
      installed = manifest.version
    } catch {
      // Missing and malformed manifests both require a deliberate reinstall.
    }
    if (installed !== expected) mismatches.push(`${name} : version ${expected} requise`)
  }
  if (mismatches.length) {
    throw new Error(`Dépendances de démo absentes ou différentes du lockfile :\n${mismatches.join("\n")}\nExécutez npm ci depuis la racine du projet avant de réessayer. Le lanceur n’installe aucun paquet.`)
  }
}
