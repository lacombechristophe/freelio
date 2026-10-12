// Called only after seed-ui-redesign has checked its isolated database.
export async function seedExpenseProjectChoices(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional expense project selector ${surface}` } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `expense-project-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const clientId = `cexpensepickerclient${surface}`
    const projectId = `cexpensepickerolder${surface}`
    await prisma.client.create({ data: { id: clientId, companyId, name: "Fictional selector customer" } })
    await prisma.project.create({ data: { id: projectId, companyId, clientId, name: "ZZ ANCIEN CHANTIER", createdAt: new Date("2000-01-01") } })
    await prisma.project.createMany({ data: Array.from({ length: 100 }, (_, i) => ({ companyId, clientId, name: `Recent project ${String(i).padStart(3, "0")}`, createdAt: new Date("2001-01-01") })) })
    await prisma.expense.create({ data: { companyId, clientId, projectId, label: "EXISTING-LINKED-EXPENSE", amountCents: 1234, category: "Fournitures", date: new Date("2000-01-01") } })
    await prisma.expense.create({ data: { companyId, clientId, label: "CLIENT-ONLY-EXPENSE", amountCents: 5678, category: "Fournitures", date: new Date("2000-01-01") } })
  }
}
