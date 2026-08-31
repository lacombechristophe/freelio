import { access, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import { gunzip as gunzipCallback } from "node:zlib"

import { verifyReversibilityExport } from "../src/lib/backup-integrity"
import { decryptBytes } from "../src/lib/crypto"

const gunzip = promisify(gunzipCallback)

function outputPath(inputPath: string, requestedPath?: string) {
  if (requestedPath) return path.resolve(requestedPath)
  const withoutEnvelope = inputPath.endsWith(".enc") ? inputPath.slice(0, -4) : `${inputPath}.decrypted`
  return path.resolve(withoutEnvelope.endsWith(".gz") ? withoutEnvelope.slice(0, -3) : withoutEnvelope)
}

async function main() {
  const input = process.argv[2]
  if (!input) throw new Error("Usage : npm run backup:decrypt -- <archive.json.gz.enc> [sortie.json]")

  const source = path.resolve(input)
  const destination = outputPath(source, process.argv[3])
  if (source === destination) throw new Error("La sortie doit être différente de l’archive source.")
  try {
    await access(destination)
    throw new Error(`Le fichier de sortie existe déjà : ${destination}`)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Le fichier de sortie existe déjà")) throw error
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }

  const encrypted = await readFile(source)
  const decompressed = await gunzip(decryptBytes(encrypted))
  const parsed: unknown = JSON.parse(decompressed.toString("utf8"))
  const verification = verifyReversibilityExport(parsed)
  if (!verification.ok) {
    throw new Error(`Archive invalide : ${verification.errors.join(" ")}`)
  }

  await writeFile(destination, `${JSON.stringify(parsed, null, 2)}\n`, { encoding: "utf8", flag: "wx" })
  console.log(JSON.stringify({ output: destination, status: verification.status, warnings: verification.warnings }))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Déchiffrement impossible")
  process.exitCode = 1
})
