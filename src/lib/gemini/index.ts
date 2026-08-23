import { GoogleGenerativeAI } from "@google/generative-ai"
import prisma from "@/lib/prisma"
import { getContext } from "@/lib/context"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "")

function sanitizeForAi(data: unknown): string {
  const str = typeof data === "string" ? data : JSON.stringify(data)
  return str
    .replace(/[A-Z]{2}\d{2}[A-Z0-9]{11,30}/g, "[IBAN]")
    .replace(/\d{14}/g, "[SIRET]")
}

export async function askGemini(prompt: string, context?: unknown) {
  const userContext = getContext()
  const userId = userContext?.userId
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

  const systemPrompt = `Tu es l'assistant de Freelio, un SaaS pour auto-entrepreneurs français.
  Ton but est d'aider à la rédaction professionnelle.
  Reste concis, précis et institutionnel (ton Linear/Stripe).
  NE cite JAMAIS de montants financiers précis ni de SIRET/IBAN.

  Contexte : ${sanitizeForAi(context)}`

  const result = await model.generateContent([systemPrompt, prompt])

  if (userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { aiUsageCount: { increment: 1 } },
    })
  }

  const response = result.response
  return response.text()
}

export async function analyzeExpense(imageBuffer: Buffer, mimeType: string) {
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" })

  const prompt = `Analyse ce reçu de dépense pour un auto-entrepreneur.
  Extrait uniquement :
  1. Le nom du fournisseur (Merchant)
  2. La date de la dépense
  3. La catégorie probable (SaaS, Repas, Matériel, Transport)
  4. Le montant TTC approximatif (pour suggestion)

  Réponds UNIQUEMENT avec du JSON valide, sans markdown, sans backticks :
  { "merchant": "", "date": "", "category": "", "amountTtc": 0 }`

  const imagePart = {
    inlineData: {
      data: imageBuffer.toString("base64"),
      mimeType,
    },
  }

  const result = await model.generateContent([prompt, imagePart])
  const response = result.response
  const text = response.text().trim()

  try {
    return JSON.parse(text)
  } catch {
    // Gemini sometimes wraps JSON in markdown code blocks
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      return JSON.parse(match[0])
    }
    throw new Error("La réponse de l'IA n'est pas au format JSON attendu")
  }
}
