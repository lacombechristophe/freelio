import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Freelio - CRM pour piscinistes",
    short_name: "Freelio",
    description: "Ventes, chantiers, stock, interventions et service client.",
    start_url: "/dashboard/terrain",
    scope: "/",
    display: "standalone",
    background_color: "#f6f8fb",
    theme_color: "#0b63f6",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/crm-icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/crm-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
