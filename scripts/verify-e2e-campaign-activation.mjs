// Exercise the real processor against the fictional CI database, without
// advancing email transports or launching another application server.
if (process.env.RECIPE_ISOLATED !== "true" || process.env.DATABASE_URL !== "file:./e2e-ci.db") throw new Error("An isolated E2E database is required")
const name = process.argv[2]
if (!name || !/^(UIQA Activation |Campagne QA printemps )/.test(name)) throw new Error("A declared fictional campaign is required")
const { default: prisma } = await import("../src/lib/prisma.ts")
const { processCampaignActivations } = await import("../src/lib/marketing/campaign-activation.ts")
try {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: "e2e-company" } })
  const campaign = await prisma.marketingCampaign.findUniqueOrThrow({ where: { companyId_name: { companyId: company.id, name } } })
  if (!await prisma.campaignAudience.count({ where: { campaignId: campaign.id, companyId: company.id, status: "ENROLLING" } })) throw new Error("The fictional activation was not queued")
  const result = await processCampaignActivations({ companyId: company.id })
  if (result.failed) throw new Error("Fictional activation processing failed")
  process.stdout.write(JSON.stringify(result))
} finally { await prisma.$disconnect() }
