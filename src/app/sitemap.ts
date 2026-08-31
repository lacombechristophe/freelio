import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.PUBLIC_APP_URL || process.env.AUTH_URL || "https://freelio-eight.vercel.app").replace(/\/$/, "")
  return ["", "/fonctionnalites", "/tarifs", "/faq", "/conformite", "/confidentialite", "/conditions"].map((path, index) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: index === 0 ? "weekly" as const : "monthly" as const,
    priority: index === 0 ? 1 : 0.7,
  }))
}
