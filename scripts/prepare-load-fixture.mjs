import { PrismaClient } from "@prisma/client"
const url = new URL(process.env.DATABASE_URL || "")
if (process.env.RECIPE_ISOLATED !== "true" || !["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/freelio_demo_load")) throw Error("Base locale de charge fictive requise")
const prisma = new PrismaClient()
try {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "direction@atelier-des-bassins.example.test" }, select: { companyId: true } })
  if (!user.companyId) throw Error("Compte fictif sans entreprise")
  const before = await prisma.client.count({ where: { companyId: user.companyId } })
  if (before > 10_000) throw Error("Corpus déjà supérieur au volume attendu")
  for (let offset = before; offset < 10_000; offset += 500) {
    const size = Math.min(500, 10_000 - offset)
    await prisma.client.createMany({ data: Array.from({ length: size }, (_, index) => ({ companyId: user.companyId, name: `Charge fictive ${String(offset + index + 1).padStart(5, "0")}`, type: "INDIVIDUAL", address: "Adresse de test — aucune personne réelle" })) })
  }
  console.log(JSON.stringify({ clients: await prisma.client.count({ where: { companyId: user.companyId } }), corpus: "10,000 synthetic client records; other domains keep the small demo fixture" }))
} finally {
  await prisma.$disconnect()
}
