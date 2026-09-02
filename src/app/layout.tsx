import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// `next start` loads .env.production locally as well. VERCEL alone is therefore
// not enough to decide whether the hosted analytics endpoints are available.
const isVercelRuntime = process.env.VERCEL === "1" && Boolean(process.env.VERCEL_URL);

function publicOrigin() {
  const configured = process.env.PUBLIC_APP_URL || process.env.AUTH_URL || "https://freelio-eight.vercel.app";
  try { return new URL(configured); } catch { return new URL("https://freelio-eight.vercel.app"); }
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: publicOrigin(),
  manifest: "/manifest.webmanifest",
  applicationName: "Freelio Piscine",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Freelio" },
  title: {
    default: "Freelio - CRM pour piscinistes",
    template: "%s | Freelio",
  },
  description:
    "CRM et ERP métier pour les piscinistes : ventes, chantiers, parc installé, stocks, SAV, entretien et facturation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-background font-sans text-foreground"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
        {isVercelRuntime ? <><Analytics /><SpeedInsights /></> : null}
      </body>
    </html>
  );
}
