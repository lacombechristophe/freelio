"use server"

import { analyzeExpense } from "@/lib/gemini"
import { withAuth } from "@/lib/auth-wrapper"

export async function processExpenseOcr(base64Data: string, mimeType: string) {
  return await withAuth(async () => {
    // Check if GEMINI_API_KEY is defined
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== ""

    if (!hasApiKey) {
      console.warn("GEMINI_API_KEY non configurée. Utilisation du fallback OCR local...")
      return getMockOcrFallback()
    }

    try {
      const buffer = Buffer.from(base64Data, "base64")
      const result = await analyzeExpense(buffer, mimeType)
      
      // Map return fields to match our form
      return {
        label: result.merchant ? `Facture ${result.merchant}` : "Achat Fournisseur",
        provider: result.merchant || "Fournisseur",
        amountCents: Math.round((result.amountTtc || 0) * 100),
        tvaCents: Math.round(((result.amountTtc || 0) * 0.20) * 100), // Default 20% TVA estimate
        date: result.date || new Date().toISOString().slice(0, 10),
        category: mapCategory(result.category),
        confidence: "HIGH"
      }
    } catch (error) {
      console.error("Erreur lors de l'OCR intelligent Gemini:", error)
      return getMockOcrFallback()
    }
  })
}

function mapCategory(cat: string): string {
  const c = (cat || "").toLowerCase()
  if (c.includes("saas") || c.includes("logiciel") || c.includes("abonnement")) return "SaaS"
  if (c.includes("repas") || c.includes("restaurant") || c.includes("nourriture")) return "Repas"
  if (c.includes("matériel") || c.includes("achat") || c.includes("fourniture") || c.includes("office")) return "Matériel"
  if (c.includes("transport") || c.includes("train") || c.includes("taxi") || c.includes("voiture") || c.includes("car")) return "Transport"
  return "Matériel" // Default fallback category
}

function getMockOcrFallback() {
  // Generate structured simulated data
  const mocks = [
    {
      merchant: "Adobe Systems SaaS",
      category: "SaaS",
      amountTtc: 35.99,
      tvaPercent: 0.20
    },
    {
      merchant: "L'Étoile du Midi Restaurant",
      category: "Repas",
      amountTtc: 24.50,
      tvaPercent: 0.10
    },
    {
      merchant: "SNCF Voyageurs",
      category: "Transport",
      amountTtc: 79.00,
      tvaPercent: 0.10
    },
    {
      merchant: "LDLC Informatique",
      category: "Matériel",
      amountTtc: 189.99,
      tvaPercent: 0.20
    }
  ]

  // Pick a mock based on milliseconds to add variation
  const pick = mocks[Date.now() % mocks.length]
  const amountCents = Math.round(pick.amountTtc * 100)
  const tvaCents = Math.round((pick.amountTtc * pick.tvaPercent) * 100)

  return {
    label: `Facture ${pick.merchant} (Simulé OCR)`,
    provider: pick.merchant,
    amountCents,
    tvaCents,
    date: new Date().toISOString().slice(0, 10),
    category: pick.category,
    confidence: "MOCK"
  }
}
