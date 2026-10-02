import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

it("blocks supplier HTTP, fetch and TCP even with a mistakenly present API key; preserves infrastructure read restrictions", () => {
  const script = `
    const assert=require('node:assert/strict');
    const {allowedUrl}=require('./scripts/public-demo-network.cjs');
    assert.equal(allowedUrl('https://synthetic.rdb.upstash.io', {method:'POST'}), true);
    assert.equal(allowedUrl('https://${"a".repeat(32)}.r2.cloudflarestorage.com/file', {method:'PUT'}), false);
    assert.equal(allowedUrl('https://api.resend.com/emails', {method:'POST'}), false);
    assert.equal(allowedUrl('http://127.0.0.1:3000/dashboard', {method:'GET'}), true);
    assert.equal(allowedUrl('http://localhost:3000/dashboard', {method:'HEAD'}), true);
    assert.equal(allowedUrl('http://localhost:3000/dashboard', {method:'POST'}), false);
    assert.equal(allowedUrl('http://localhost:3001/dashboard', {method:'GET'}), false);
    assert.equal(allowedUrl('http://127.0.0.2:3000/dashboard', {method:'GET'}), false);
    assert.throws(()=>require('node:https').request('https://api.resend.com/emails'), /interdit/);
    assert.throws(()=>require('node:net').connect({host:'smtp.example.test',port:465}), /interdit/);
    fetch('https://api.resend.com/emails',{method:'POST'}).then(()=>{process.exitCode=1},error=>assert.match(error.message,/interdit/));
  `
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, DATABASE_URL: "postgresql://fake:fake@127.0.0.1:55442/fake", UPSTASH_REDIS_REST_URL: "https://synthetic.rdb.upstash.io", R2_ACCOUNT_ID: "a".repeat(32), RESEND_API_KEY: "synthetic-only" }, encoding: "utf8" })
  expect(result.status, result.stderr).toBe(0)
})
