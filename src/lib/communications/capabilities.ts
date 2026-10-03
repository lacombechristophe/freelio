export class MailReconnectRequiredError extends Error {}

export function mailScopeGranted(provider: string, scopes: string, operation: "READ" | "SEND") {
  const granted = new Set(scopes.toLowerCase().split(/\s+/).filter(Boolean))
  if (provider === "GOOGLE") return granted.has("https://mail.google.com/") || granted.has("https://www.googleapis.com/auth/gmail.modify") || granted.has(`https://www.googleapis.com/auth/gmail.${operation === "READ" ? "readonly" : "send"}`)
  if (provider === "MICROSOFT") return operation === "SEND" ? granted.has("mail.send") : granted.has("mail.read") || granted.has("mail.readwrite")
  return provider === "RESEND"
}
