import { spawnSync } from "node:child_process"
import { expect, it } from "vitest"

it("allows TLS upgrades only for a socket connected to the configured infrastructure endpoint", () => {
  const script = `
    const assert=require('node:assert/strict');
    const net=require('node:net'), tls=require('node:tls');
    // Replace transports before loading the preload: this test opens no sockets.
    net.Socket.prototype.connect=function(){return this};
    tls.connect=function(){return 'accepted'};
    require('./scripts/public-demo-network.cjs');
    for(const args of [[55442,'database.example.test'], [{host:'database.example.test',port:55442}], [[{host:'database.example.test',port:55442}]]]){
      const socket=new net.Socket(); socket.connect(...args);
      assert.equal(tls.connect({socket,host:'database.example.test',servername:'database.example.test'}),'accepted');
      assert.equal(tls.connect({socket,servername:'database.example.test'}),'accepted');
      assert.throws(()=>tls.connect({socket,host:'foreign.example.test'}), /interdit/);
      assert.throws(()=>tls.connect({socket,host:'database.example.test',port:443}), /interdit/);
      assert.throws(()=>tls.connect({socket,servername:'foreign.example.test'}), /interdit/);
      socket.connect(55442,'foreign.example.test');
      assert.throws(()=>tls.connect({socket,host:'database.example.test'}), /interdit/);
    }
    assert.throws(()=>tls.connect({socket:new net.Socket(),host:'database.example.test',port:55442}), /interdit/);
    assert.equal(tls.connect({host:'database.example.test',port:55442}),'accepted');
    assert.throws(()=>tls.connect({host:'foreign.example.test',port:55442}), /interdit/);
  `
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, DATABASE_URL: "postgresql://fake:fake@database.example.test:55442/fake" }, encoding: "utf8" })
  expect(result.status, result.stderr).toBe(0)
})

it("blocks supplier HTTP, fetch and TCP even with a mistakenly present API key; preserves infrastructure read restrictions", () => {
  const script = `
    const assert=require('node:assert/strict');
    const {allowedUrl}=require('./scripts/public-demo-network.cjs');
    assert.equal(allowedUrl('https://synthetic.rdb.upstash.io', {method:'POST'}), true);
    assert.equal(allowedUrl('https://${"a".repeat(32)}.r2.cloudflarestorage.com/file', {method:'PUT'}), false);
    assert.equal(allowedUrl('https://api.resend.com/emails', {method:'POST'}), false);
    assert.equal(allowedUrl('https://demo.example.test/dashboard', {method:'GET'}), true);
    assert.equal(allowedUrl('https://demo.example.test/dashboard', {method:'HEAD'}), true);
    assert.equal(allowedUrl('https://demo.example.test/dashboard', {method:'POST'}), false);
    assert.equal(allowedUrl('https://demo.example.test:444/dashboard', {method:'GET'}), false);
    assert.equal(allowedUrl('http://127.0.0.1:3000/dashboard', {method:'GET'}), true);
    assert.equal(allowedUrl('http://localhost:3000/dashboard', {method:'HEAD'}), true);
    assert.equal(allowedUrl('http://localhost:3000/dashboard', {method:'POST'}), false);
    assert.equal(allowedUrl('http://localhost:3001/dashboard', {method:'GET'}), false);
    assert.equal(allowedUrl('http://127.0.0.2:3000/dashboard', {method:'GET'}), false);
    assert.throws(()=>require('node:https').request('https://api.resend.com/emails'), /interdit/);
    assert.throws(()=>require('node:net').connect({host:'smtp.example.test',port:465}), /interdit/);
    fetch('https://api.resend.com/emails',{method:'POST'}).then(()=>{process.exitCode=1},error=>assert.match(error.message,/interdit/));
  `
  const result = spawnSync(process.execPath, ["-e", script], { cwd: process.cwd(), env: { NODE_ENV: "test", SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, PUBLIC_APP_URL: "https://demo.example.test", DATABASE_URL: "postgresql://fake:fake@127.0.0.1:55442/fake", UPSTASH_REDIS_REST_URL: "https://synthetic.rdb.upstash.io", R2_ACCOUNT_ID: "a".repeat(32), RESEND_API_KEY: "synthetic-only" }, encoding: "utf8" })
  expect(result.status, result.stderr).toBe(0)
})
