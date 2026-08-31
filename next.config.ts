import type { NextConfig } from "next"

const developmentEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""
const upgradeInsecureRequests = process.env.NODE_ENV === "production" ? " upgrade-insecure-requests;" : ""
const r2AccountId = process.env.R2_ACCOUNT_ID?.trim() ?? ""
const r2ConnectOrigin = /^[a-f0-9]{32}$/i.test(r2AccountId) ? ` https://${r2AccountId}.r2.cloudflarestorage.com` : ""

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { sri: { algorithm: "sha384" } },
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@prisma/client", "@crm/prisma-postgres"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'${developmentEval} https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self'${r2ConnectOrigin}; frame-ancestors 'none';${upgradeInsecureRequests}`,
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=()",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ]
  },
}

export default nextConfig
