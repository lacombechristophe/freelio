import { execFileSync } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"

// Read-only scan. Reports paths/rules, never the matched value.
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean)
const findings = []
let placeholdersExcluded = 0
const rules = [
  ["provider-token", /\b(?:sk_live_|rk_live_|ghp_|github_pat_|xox[baprs]-)[A-Za-z0-9_-]{16,}/g],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["resend-key", /\bre_[A-Za-z0-9]{24,}\b/g],
]
for (const file of new Set(files)) {
  if ((/(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example") || /(?:\.db(?:-|$)|(^|\/)(demo|recipe)-access\.json$|^data\/)/.test(file)) {
    findings.push({ file, rule: "private-artifact" })
    continue
  }
  let bytes
  try { bytes = await fs.readFile(path.resolve(file)) } catch (error) { if (error.code === "ENOENT") continue; throw error }
  if (bytes.includes(0)) continue
  const source = bytes.toString("utf8")
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0
    for (const match of source.matchAll(pattern)) {
      if (/^sk_live_[xX]{16,}$/.test(match[0])) placeholdersExcluded++
      else findings.push({ file, rule })
    }
  }
}
let historyBlobsChecked = 0
if (process.argv.includes("--history")) {
  const objects = execFileSync("git", ["rev-list", "--objects", "--all"], { encoding: "utf8" }).trim().split("\n")
  const lines = execFileSync("git", ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"], { input: objects.map(line => line.split(" ")[0]).join("\n") + "\n", encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }).trim().split("\n")
  for (let index = 0; index < lines.length; index++) {
    const [oid, kind, size] = lines[index].split(" ")
    if (kind !== "blob") continue
    const file = objects[index].slice(oid.length + 1)
    if (Number(size) > 5 * 1024 * 1024) { findings.push({ file, oid, rule: "history-blob-too-large-to-scan" }); continue }
    const bytes = execFileSync("git", ["cat-file", "blob", oid], { maxBuffer: 6 * 1024 * 1024 })
    historyBlobsChecked++
    if (bytes.includes(0)) continue
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0
      for (const match of bytes.toString("utf8").matchAll(pattern)) {
        if (/^sk_live_[xX]{16,}$/.test(match[0])) placeholdersExcluded++
        else findings.push({ file, oid, rule })
      }
    }
  }
}
console.log(JSON.stringify({ schema: "freelio.publication-scan.v1", filesChecked: new Set(files).size, historyBlobsChecked, placeholdersExcluded, findings }, null, 2))
if (findings.length) process.exitCode = 1
