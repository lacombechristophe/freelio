import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

// Read-only fingerprint of the reviewable working tree, including untracked
// source files. It neither prints file contents nor certifies a clean release.
const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
const files = []
for (const name of [...new Set(listed)].sort()) {
  if ((/(^|\/)\.env(?:\.|$)/.test(name) && name !== ".env.example") || /\.db(?:$|-)|(^|\/)(?:data|uploads|\.auth)\/|(^|\/)(?:demo|recipe)-access\.json$/.test(name)) continue
  try {
    const resolved = path.resolve(name)
    const stat = await fs.lstat(resolved)
    if (!stat.isFile()) throw Error(`Entrée de source non régulière : ${name}`)
    const bytes = await fs.readFile(resolved)
    files.push({ path: name, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") })
  } catch (error) {
    if (error.code !== "ENOENT") throw error
  }
}
const git = args => execFileSync("git", args, { encoding: "utf8" }).trim()
const status = git(["status", "--porcelain"])
console.log(JSON.stringify({
  schema: "freelio.source-fingerprint.v1", generatedAt: new Date().toISOString(),
  baseCommit: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]),
  reference: status ? "working-tree-with-uncommitted-changes" : "committed-working-tree", status,
  workingTreeSha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"), fileCount: files.length, files,
  limits: ["Empreinte de fichiers, pas attestation de tests", ...(status ? ["Le commit de base ne contient pas les changements locaux"] : []), "Dépendances, secrets et données de recette exclus"],
}, null, 2))
