const sessionCookie = /^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=([^;]*)/

/** Page responses must not restore a session after a concurrent sign-out. */
export function preventPageSessionRefresh(method: string, headers: Headers) {
  if (method !== "GET" && method !== "HEAD") return
  const cookies = headers.getSetCookie()
  if (!cookies.some(cookie => sessionCookie.exec(cookie)?.[1])) return

  // Drop a rotation as a whole, including cleanup of its previous chunks.
  // A response containing only invalid-session deletions must still clear them.
  headers.delete("set-cookie")
  for (const cookie of cookies) {
    if (!sessionCookie.test(cookie)) headers.append("set-cookie", cookie)
  }
}
