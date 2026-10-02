// Loaded only by scripts/demo.mjs in its dedicated local workspace.
/* eslint-disable @typescript-eslint/no-require-imports -- Synchronous Node --require preload. */
const fonts = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
const local = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function allowedUrl(input, options = {}) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (local.has(url.hostname)) return ["http:", "https:"].includes(url.protocol);
  const method = String(options.method || input.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || input.headers);
  return url.protocol === "https:" && (!url.port || url.port === "443") && fonts.has(url.hostname)
    && method === "GET" && !url.username && !url.password && !options.auth && !headers.has("authorization") && !headers.has("cookie");
}

const deny = () => { throw new Error("La démonstration locale interdit les connexions fournisseur."); };
for (const name of ["node:http", "node:https"]) {
  const transport = require(name);
  for (const method of ["request", "get"]) {
    const original = transport[method];
    transport[method] = function (input, ...args) {
      const options = input && typeof input === "object" && !(input instanceof URL) ? input : args[0] || {};
      const url = typeof input === "string" || input instanceof URL ? input : new URL(`${name === "node:https" ? "https" : "http"}://${options.hostname || options.host || "localhost"}:${options.port || (name === "node:https" ? 443 : 80)}${options.path || "/"}`);
      if (!allowedUrl(url, options)) deny();
      return original.call(this, input, ...args);
    };
  }
}
for (const name of ["node:net", "node:tls"]) {
  const transport = require(name);
  for (const method of ["connect", "createConnection"]) {
    if (!transport[method]) continue;
    const original = transport[method];
    transport[method] = function (...args) {
      const options = typeof args[0] === "object" ? args[0] : { port: args[0], host: typeof args[1] === "string" ? args[1] : "localhost" };
      const host = options.hostname || options.host || "localhost";
      if (!local.has(host) && !(fonts.has(host) && Number(options.port) === 443)) deny();
      return original.apply(this, args);
    };
  }
}
const originalFetch = global.fetch;
global.fetch = function (input, options) {
  if (!allowedUrl(input, options)) return Promise.reject(new Error("La démonstration locale interdit les connexions fournisseur."));
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  return originalFetch(input, fonts.has(url.hostname) ? { ...options, redirect: "error" } : options);
};
module.exports = { allowedUrl };
require("node:module").syncBuiltinESMExports();
