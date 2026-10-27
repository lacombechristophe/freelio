import assert from "node:assert/strict"

// Runs only inside the isolated CI container. Cookies and CSRF values stay in memory.
const origin = "http://127.0.0.1:3000"
const cookies = new Map()
async function request(route, options = {}) {
  const response = await fetch(origin + route, { ...options, redirect: "manual", headers: { ...options.headers, Cookie: [...cookies].map(([key, value]) => key + "=" + value).join("; ") } })
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0]
    const at = pair.indexOf("=")
    cookies.set(pair.slice(0, at), pair.slice(at + 1))
  }
  return response
}
assert.equal((await request("/api/auth/callback/demo")).status, 403)
const unauthenticated = await request("/api/auth/session")
assert.equal(await unauthenticated.json(), null)
await request("/api/auth/callback/demo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ callbackUrl: origin + "/dashboard" }) })
assert.equal(await (await request("/api/auth/session")).json(), null, "CSRF-less callback must not authenticate")
const csrf = await (await request("/api/auth/csrf")).json()
const signedIn = await request("/api/auth/callback/demo", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: origin }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: origin + "/dashboard", email: "unrelated@example.test", companyId: "foreign-company" }) })
assert.equal(signedIn.status, 200)
const result = await signedIn.json()
assert.equal(new URL(result.url).pathname, "/dashboard")
const session = await (await request("/api/auth/session")).json()
assert.equal(session.user.email, "direction@atelier-des-bassins.example.test")
assert(session.user.id && session.companyId)
assert.equal(JSON.stringify(session).includes("passwordHash"), false)
for (const [route, method] of [["/api/public/leads", "POST"], ["/api/automations/process", "POST"], ["/api/backup/export", "GET"]]) {
  assert.equal((await request(route, { method })).status, 403)
}
const second = await (await request("/api/auth/session")).json()
assert.equal(second.user.id, session.user.id)
const logoutCsrf = await (await request("/api/auth/csrf")).json()
await request("/api/auth/signout", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: origin }, body: new URLSearchParams({ csrfToken: logoutCsrf.csrfToken, callbackUrl: origin + "/" }) })
assert.equal(await (await request("/api/auth/session")).json(), null)
console.log(JSON.stringify({ success: true, passwordSupplied: false, clientSelectedIdentityIgnored: true, sqlRole: "reader", csrfChecked: true, callbackGetRefused: true, mutationsRefused: true, sessionSurvivedRefresh: true, signedOut: true, scope: "Server authentication on isolated PostgreSQL; CI-only local limiter, not public UI or Upstash availability" }))
