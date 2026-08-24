"use server"

import { analyzeExpense } from "@/lib/gemini"
import { withAuth } from "@/lib/auth-wrapper"

export async function processExpenseOcr(base64Data: string, mimeType: string) {
  return await withAuth(async () => {
    const hasApiKey = !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== ""

    if (!hasApiKey) {
      throw new Error("La lecture OCR n'est pas configurée. Saisissez la dépense manuellement.")
    }

    try {
      const buffer = Buffer.from(base64Data, "base64")
      const result = await analyzeExpense(buffer, mimeType)
      
      return {
        label: result.merchant ? `Facture ${result.merchant}` : "Achat Fournisseur",
        provider: result.merchant || "Fournisseur",
        amountCents: Math.round(result.amountTtc * 100),
        tvaCents: Math.round((result.amountTva ?? 0) * 100),
        date: result.date || new Date().toISOString().slice(0, 10),
        category: mapCategory(result.category),
        confidence: "SUGGESTION" as const,
      }
    } catch (error) {
      console.error("Erreur lors de l'OCR intelligent Gemini:", error)
      throw new Error("Lecture OCR impossible. Vérifiez la pièce et saisissez les montants manuellement.")
    }
  })
}

function mapCategory(cat: string): string {
  const c = (cat || "").toLowerCase()
  if (c.includes("saas") || c.includes("logiciel") || c.includes("abonnement")) return "Logiciel"
  if (c.includes("repas") || c.includes("restaurant") || c.includes("nourriture")) return "Repas"
  if (c.includes("sous-trait")) return "Sous-traitance"
  if (c.includes("matériel")) return "Matériel"
  if (c.includes("achat") || c.includes("fourniture") || c.includes("office")) return "Fournitures"
  if (c.includes("transport") || c.includes("déplacement") || c.includes("train") || c.includes("taxi") || c.includes("voiture")) return "Déplacement"
  return "Autre"
}
