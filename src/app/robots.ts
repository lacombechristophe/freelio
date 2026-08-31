import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || "https://freelio-eight.vercel.app"
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/dashboard/", "/onboarding/", "/portal/", "/sign/", "/join/", "/consent/", "/feedback/", "/offline/"] },
    sitemap: `${base.replace(/\/$/, "")}/sitemap.xml`,
  }
}
