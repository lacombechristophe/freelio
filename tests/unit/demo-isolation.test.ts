import { expect, it } from "vitest"
import { execFileSync } from "node:child_process"
import { mkdtemp, readdir, writeFile } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { acquireDemoLock } from "../../scripts/demo-lock.mjs"

it("blocks provider HTTP, fetch and raw sockets while permitting only local requests and credential-free font downloads", () => {
  const output = execFileSync(process.execPath, ["--require", path.resolve("scripts/demo-network.cjs"), "-e", `
    const assert=require('node:assert/strict');
    const {allowedUrl}=require(${JSON.stringify(path.resolve("scripts/demo-network.cjs"))});
    assert(allowedUrl('http://127.0.0.1:54177/dashboard'));
    assert(allowedUrl('https://fonts.gstatic.com/font.woff2'));
    assert(!allowedUrl('https://fonts.gstatic.com/font.woff2',{method:'POST'}));
    assert(!allowedUrl('https://fonts.gstatic.com/font.woff2',{headers:{authorization:'synthetic'}}));
    assert(!allowedUrl('https://fonts.gstatic.com/font.woff2',{auth:'synthetic'}));
    assert(!allowedUrl('https://api.resend.com/emails'));
    assert(!allowedUrl('https://fonts.gstatic.com.example.test/font.woff2'));
    assert.throws(()=>require('node:https').request('https://api.resend.com/emails'),/interdit/);
    assert.throws(()=>require('node:net').connect({host:'8.8.8.8',port:443}),/interdit/);
    assert.throws(()=>require('node:tls').connect({host:'10.0.0.1',servername:'fonts.gstatic.com',port:443}),/interdit/);
    fetch('https://api.stripe.com').then(()=>process.exit(1),()=>process.stdout.write('guard-ok'));
  `], { encoding: "utf8", env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, NODE_ENV: "test" } })
  expect(output).toBe("guard-ok")
})

it("refuses a live demo reservation and recovers a crashed process without losing the new owner", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "demo-lock-qa-"))
  const release = await acquireDemoLock(directory, "SERVER")
  await expect(acquireDemoLock(directory, "BACKUP")).rejects.toThrow(/déjà utilisée/)
  await release()
  const deadPid = Number(execFileSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" }))
  await writeFile(path.join(directory, "demo-operation.lock"), JSON.stringify({ schema: "freelio.demo-lock.v1", pid: deadPid, id: "synthetic-crashed-owner" }))
  const claims = await Promise.allSettled([acquireDemoLock(directory, "SERVER"), acquireDemoLock(directory, "BACKUP")])
  const owners = claims.filter((claim): claim is PromiseFulfilledResult<() => Promise<void>> => claim.status === "fulfilled")
  expect(owners).toHaveLength(1)
  expect(claims.filter(claim => claim.status === "rejected")).toHaveLength(1)
  expect((await readdir(directory)).filter(name => name.startsWith("demo-operation.stale-"))).toHaveLength(1)
  await owners[0].value()
})
