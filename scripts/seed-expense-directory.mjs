// Called only after seed-ui-redesign has checked its isolated database.
export async function seedExpenseDirectory(prisma, passwordHash) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).formatToParts(new Date())
  const month = `${parts.find(part => part.type === "year").value}-${parts.find(part => part.type === "month").value}`
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional expense volume ${surface}`, serviceTimezone: "Europe/Paris" } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `expense-directory-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    await prisma.expense.create({ data: { companyId, label: "EXPENSE-OLDER-ROW", provider: "Bureau Unique", amountCents: 9900, category: "Fournitures", date: new Date(`${month}-01T00:00:00.000Z`) } })
    await prisma.expense.createMany({ data: Array.from({ length: 50 }, (_, index) => ({ companyId, label: `EXPENSE-RECENT-${String(index).padStart(2, "0")}`, amountCents: 100, category: "Fournitures", date: new Date(`${month}-02T00:00:00.000Z`) })) })
  }
}
