// Called only after seed-ui-redesign has checked its disposable database.
export async function seedDocumentCalendarDates(prisma, passwordHash) {
  for (const surface of ["desktop", "mobile"]) {
    const company = await prisma.company.create({ data: { name: `Fictional document dates ${surface}` } })
    const companyId = company.id
    const user = await prisma.user.create({ data: { companyId, email: `document-dates-${surface}@example.test`, emailVerified: new Date(), passwordHash } })
    await prisma.membership.create({ data: { companyId, userId: user.id, role: "OWNER", status: "ACTIVE" } })
    await prisma.saasSubscription.create({ data: { companyId, plan: "RESEAU", status: "ACTIVE", seatQuantity: 10 } })
    const client = await prisma.client.create({ data: { companyId, name: "Fictional calendar client" } })
    for (const [marker, isoDate] of [["LATE", "1999-12-31T23:30:00.000Z"], ["EARLY", "2000-01-01T00:30:00.000Z"]]) {
      const date = new Date(isoDate)
      await prisma.quote.create({ data: { companyId, clientId: client.id, number: `CALENDAR-QUOTE-${marker}`, object: "Fictional calendar quote", date, versions: { create: { version: 1, totalHtCents: 1000, totalTvaCents: 0, totalTtcCents: 1000 } } } })
      await prisma.invoice.create({ data: { companyId, clientId: client.id, number: `CALENDAR-INVOICE-${marker}`, object: "Fictional calendar invoice", date, dueDate: date, totalHtCents: 1000, totalTvaCents: 0, totalTtcCents: 1000 } })
      await prisma.expense.create({ data: { companyId, clientId: client.id, label: `CALENDAR-EXPENSE-${marker}`, date, amountCents: 1000, category: "Matériel" } })
    }
  }
}
