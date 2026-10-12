"use server"

import { Prisma } from "@prisma/client"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { withAuth } from "@/lib/auth-wrapper"
import { calendarDayKey, calendarDayStart, calendarPeriods, shiftCalendarDay } from "@/lib/calendar-days"
import { DIRECTORY_PAGE_SIZE } from "@/lib/directory-query"

const queryInput = z.object({ search: z.string().trim().max(200).default(""), page: z.number().int().min(1).max(100000).default(1), weekOffset: z.number().int().min(-5200).max(5200).default(0) }).strict()
const projectInput = queryInput.omit({ weekOffset: true }).extend({ selectedId: z.string().trim().min(1).max(100).optional() })
const entrySelect = {
  id: true, date: true, durationSec: true, description: true, isBillable: true,
  project: { select: { id: true, name: true, client: { select: { id: true, name: true } } } },
} as const
function contains(search: string) { return { contains: search, ...(process.env.DATABASE_URL?.startsWith("postgres") ? { mode: "insensitive" as const } : {}) } }
function timeWhere(companyId: string, search: string): Prisma.TimeEntryWhereInput {
  const scope = { project: { companyId, client: { companyId } } }
  const text = contains(search)
  return search ? { AND: [scope, { OR: [{ description: text }, { project: { name: text } }, { project: { client: { name: text } } }] }] } : scope
}

export async function getTimeDirectory(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = queryInput.parse(input), now = new Date()
    return prisma.$transaction(async tx => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
      const timeZone = company.serviceTimezone, where = timeWhere(companyId, query.search)
      const today = calendarDayKey(now, timeZone)
      const monday = shiftCalendarDay(calendarDayKey(calendarPeriods(now, timeZone).weekStart, timeZone), query.weekOffset * 7)
      const days = Array.from({ length: 7 }, (_, i) => shiftCalendarDay(monday, i))
      const sums = await Promise.all([today, ...days].map(day => tx.timeEntry.aggregate({
        where: { AND: [where, { date: { gte: calendarDayStart(day, timeZone), lt: calendarDayStart(shiftCalendarDay(day, 1), timeZone) } }] }, _sum: { durationSec: true },
      })))
      const total = await tx.timeEntry.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.timeEntry.findMany({ where, select: entrySelect, orderBy: [{ date: "desc" }, { id: "desc" }], take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE })
      const week = days.map((day, i) => ({ day, start: calendarDayStart(day, timeZone), durationSec: sums[i + 1]._sum.durationSec ?? 0 }))
      return { items, total, page, timeZone, today, todaySec: sums[0]._sum.durationSec ?? 0, weekSec: week.reduce((sum, day) => sum + day.durationSec, 0), week }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

export async function getTimeProjectChoices(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const query = projectInput.parse(input)
    const scope = { companyId, client: { companyId } }
    const where = { ...scope, ...(query.search ? { OR: [{ name: contains(query.search) }, { client: { name: contains(query.search) } }] } : {}) }
    const select = { id: true, name: true, client: { select: { id: true, name: true } } } as const
    return prisma.$transaction(async tx => {
      const total = await tx.project.count({ where })
      const page = Math.min(query.page, Math.max(1, Math.ceil(total / DIRECTORY_PAGE_SIZE)))
      const items = await tx.project.findMany({ where, select, orderBy: [{ name: "asc" }, { id: "asc" }], take: DIRECTORY_PAGE_SIZE, skip: (page - 1) * DIRECTORY_PAGE_SIZE })
      const selected = query.selectedId ? await tx.project.findFirst({ where: { ...scope, id: query.selectedId }, select }) : null
      return { items, total, page, selected }
    }, { isolationLevel: "Serializable" })
  }, "operations.read")
}

function csvCell(value: unknown) {
  const text = String(value ?? "")
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  return `"${safe.replaceAll('"', '""')}"`
}

export async function exportTimeEntries(input: unknown = {}) {
  return withAuth(async ({ companyId }) => {
    const { search } = queryInput.pick({ search: true }).parse(input)
    // Bounded SQL batches within one read snapshot; never download a partial CSV.
    return prisma.$transaction(async tx => {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { serviceTimezone: true } })
      const where = timeWhere(companyId, search)
      let csv = "\uFEFF" + ["Date", "Client", "Projet", "Description", "Durée", "Durée (secondes)", "Facturable"].map(csvCell).join(";")
      let count = 0, cursor: { date: Date; id: string } | null = null
      for (;;) {
        const rows: Array<Prisma.TimeEntryGetPayload<{ select: typeof entrySelect }>> = await tx.timeEntry.findMany({
          where: cursor ? { AND: [where, { OR: [{ date: { lt: cursor.date } }, { date: cursor.date, id: { lt: cursor.id } }] }] } : where,
          select: entrySelect, orderBy: [{ date: "desc" }, { id: "desc" }], take: 1000,
        })
        for (const entry of rows) {
          const duration = `${Math.floor(entry.durationSec / 3600)}h ${Math.floor((entry.durationSec % 3600) / 60).toString().padStart(2, "0")}m`
          csv += "\r\n" + [calendarDayKey(entry.date, company.serviceTimezone), entry.project.client.name, entry.project.name, entry.description, duration, entry.durationSec, entry.isBillable ? "Oui" : "Non"].map(csvCell).join(";")
        }
        count += rows.length
        if (rows.length < 1000) break
        const last = rows[rows.length - 1]; cursor = { date: last.date, id: last.id }
      }
      return { csv, count }
    }, { isolationLevel: "Serializable", timeout: 30000 })
  }, "operations.read")
}
