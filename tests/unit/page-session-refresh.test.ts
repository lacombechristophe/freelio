import { expect, it } from "vitest"
import { preventPageSessionRefresh } from "@/lib/auth/page-session-refresh"

function responseHeaders(cookies: string[]) {
  const headers = new Headers({ "Content-Security-Policy": "default-src 'self'" })
  for (const cookie of cookies) headers.append("set-cookie", cookie)
  return headers
}

it.each(["GET", "HEAD"])("does not renew a session on a protected page %s", method => {
  const csrf = "__Host-authjs.csrf-token=fictional-csrf; Secure; Path=/"
  const headers = responseHeaders([
    "authjs.session-token=fictional-session; Path=/; HttpOnly",
    "__Secure-authjs.session-token.0=fictional-chunk; Secure; Path=/",
    "__Secure-authjs.session-token.1=fictional-chunk; Secure; Path=/",
    csrf,
  ])
  preventPageSessionRefresh(method, headers)
  expect(headers.getSetCookie()).toEqual([csrf])
  expect(headers.get("Content-Security-Policy")).toBe("default-src 'self'")
})

it("keeps invalid-session deletions when no replacement token is issued", () => {
  const cookies = [
    "authjs.session-token=; Max-Age=0; Path=/",
    "__Secure-authjs.session-token.0=; Max-Age=0; Secure; Path=/",
  ]
  const headers = responseHeaders(cookies)
  preventPageSessionRefresh("GET", headers)
  expect(headers.getSetCookie()).toEqual(cookies)
})

it("suppresses cleanup and replacement together when the token changes chunk shape", () => {
  const headers = responseHeaders([
    "__Secure-authjs.session-token.0=; Max-Age=0; Path=/",
    "__Secure-authjs.session-token.1=; Max-Age=0; Path=/",
    "__Secure-authjs.session-token=new-fictional-session; Secure; Path=/",
    "authjs.callback-url=%2Fdashboard; Path=/",
  ])
  preventPageSessionRefresh("GET", headers)
  expect(headers.getSetCookie()).toEqual(["authjs.callback-url=%2Fdashboard; Path=/"])
})

it.each(["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])("leaves %s responses unchanged", method => {
  const cookie = "__Secure-authjs.session-token=fictional-session; Secure; Path=/"
  const headers = responseHeaders([cookie])
  preventPageSessionRefresh(method, headers)
  expect(headers.getSetCookie()).toEqual([cookie])
})

it("leaves a response without cookies unchanged", () => {
  const headers = responseHeaders([])
  preventPageSessionRefresh("GET", headers)
  expect(headers.getSetCookie()).toEqual([])
  expect(headers.get("Content-Security-Policy")).toBe("default-src 'self'")
})

it("preserves similarly named cookies that are not session-token chunks", () => {
  const cookie = "authjs.session-token-extra=fictional-setting; Path=/"
  const headers = responseHeaders([cookie])
  preventPageSessionRefresh("GET", headers)
  expect(headers.getSetCookie()).toEqual([cookie])
})
