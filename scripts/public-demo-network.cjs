/* eslint-disable @typescript-eslint/no-require-imports -- Synchronous Node preload. */
// Application guard; the hosting firewall must enforce the same infrastructure allowlist.
const network = new Set();
const http = new Map();
// Next.js reads the canonical origin to complete Server Action redirects.
if (process.env.PUBLIC_APP_URL) {
  const url = new URL(process.env.PUBLIC_APP_URL);
  if (url.protocol === "https:" && !url.username && !url.password) {
    http.set(url.host, new Set(["GET", "HEAD"]));
    network.add(`${url.hostname}:${url.port || 443}`);
  }
}
for (const [raw, port] of [[process.env.DATABASE_URL, 5432], [process.env.REDIS_URL, 6379]]) {
  if (!raw) continue;
  const url = new URL(raw);
  network.add(`${url.hostname.replace(/^\[|\]$/g, "")}:${url.port || port}`);
}
if (process.env.REDIS_HOST) network.add(`${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`);
if (process.env.UPSTASH_REDIS_REST_URL) {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
  if (url.protocol !== "https:" || url.username || url.password) throw Error("Invalid demo rate limiter endpoint");
  http.set(url.host, new Set(["POST", "GET"]));
  network.add(`${url.hostname}:${url.port || 443}`);
}
if (/^[a-f0-9]{32}$/i.test(process.env.R2_ACCOUNT_ID || "")) {
  const host = `${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  http.set(host, new Set(["GET", "HEAD"]));
  network.add(`${host}:443`);
}
for (const host of ["127.0.0.1", "localhost", "::1"]) network.add(`${host}:${process.env.PORT || 3000}`);
const message = "La démonstration en lecture seule interdit les connexions fournisseur.";
function allowedUrl(input, options = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const method = String(options.method || input.method || "GET").toUpperCase();
  if (url.username || url.password) return false;
  // Next.js fetches its own redirected pages after Server Actions. Keep that
  // path on the explicit local web port and restrict it to reads.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (["127.0.0.1", "localhost", "::1"].includes(host) && url.protocol === "http:" && url.port === String(process.env.PORT || 3000)) return ["GET", "HEAD"].includes(method);
  return url.protocol === "https:" && (http.get(url.host)?.has(method) ?? false);
}
const deny = () => { throw Error(message); };
for (const [name, transport] of [["node:http", require("node:http")], ["node:https", require("node:https")]]) {
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function(input, ...args) {
      const options = input && typeof input === "object" && !(input instanceof URL) ? input : args[0] || {};
      const url = typeof input === "string" || input instanceof URL ? input : new URL(`${name === "node:https" ? "https" : "http"}://${options.hostname || options.host || "localhost"}:${options.port || (name === "node:https" ? 443 : 80)}${options.path || "/"}`);
      if (!allowedUrl(url, options)) deny();
      return original.call(this, input, ...args);
    };
  }
}
for (const transport of [require("node:net"), require("node:tls")]) {
  for (const method of ["connect", "createConnection"]) {
    if (!transport[method]) continue;
    const original = transport[method];
    transport[method] = function(...args) {
      const options = typeof args[0] === "object" ? args[0] : {port:args[0],host:typeof args[1] === "string" ? args[1] : "localhost"};
      const host = String(options.hostname || options.host || "localhost").replace(/^\[|\]$/g, "");
      if (!network.has(`${host}:${options.port}`)) deny();
      return original.apply(this, args);
    };
  }
}
const originalFetch = global.fetch;
global.fetch = function(input, options) {
  if (!allowedUrl(input, options)) return Promise.reject(Error(message));
  return originalFetch(input, {...options, redirect:"error"});
};
require("node:module").syncBuiltinESMExports();
module.exports = { allowedUrl };
