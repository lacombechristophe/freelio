import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

function active(pid) {
  if (!Number.isInteger(pid) || pid <= 0) throw new Error("Réservation de démo invalide ; inspection manuelle nécessaire")
  try { process.kill(pid, 0); return true }
  catch (error) { if (error.code === "ESRCH") return false; throw error }
}

export async function acquireDemoLock(directory, mode) {
  const lock = path.join(directory, "demo-operation.lock")
  const recovery = path.join(directory, "demo-recovery.lock")
  const owner = { schema: "freelio.demo-lock.v1", pid: process.pid, mode, id: randomUUID() }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await fs.writeFile(lock, JSON.stringify(owner), { flag: "wx" })
      return async () => {
        const current = JSON.parse(await fs.readFile(lock, "utf8"))
        if (current.id === owner.id) await fs.rm(lock)
      }
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      // Serialize crash recovery so two retries cannot displace a new live owner.
      await fs.mkdir(recovery)
      try {
        const previous = JSON.parse(await fs.readFile(lock, "utf8"))
        if (previous.schema !== owner.schema || active(previous.pid)) throw new Error("Cette démo est déjà utilisée ; arrêtez-la avant de sauvegarder ou de redémarrer")
        await fs.rename(lock, path.join(directory, `demo-operation.stale-${randomUUID()}.json`))
        const running = path.join(directory, "demo-running.json")
        const state = JSON.parse(await fs.readFile(running, "utf8").catch(() => "null"))
        if (state?.pid === previous.pid) await fs.rm(running)
        await fs.writeFile(lock, JSON.stringify(owner), { flag: "wx" })
        return async () => {
          const current = JSON.parse(await fs.readFile(lock, "utf8"))
          if (current.id === owner.id) await fs.rm(lock)
        }
      } finally { await fs.rmdir(recovery) }
    }
  }
  throw new Error("Impossible de réserver la démonstration")
}
