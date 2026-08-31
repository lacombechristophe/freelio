import prisma from "@/lib/prisma"
import { withRouteAuth } from "@/lib/route-auth"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function icsText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;")
}

function icsDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("")
}

function event(input: { uid: string; title: string; description?: string | null; start: Date; end?: Date | null }) {
  const end = input.end ?? new Date(input.start.getFullYear(), input.start.getMonth(), input.start.getDate() + 1)
  return [
    "BEGIN:VEVENT",
    `UID:${icsText(input.uid)}@crm.local`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART;VALUE=DATE:${icsDate(input.start)}`,
    `DTEND;VALUE=DATE:${icsDate(end)}`,
    `SUMMARY:${icsText(input.title)}`,
    input.description ? `DESCRIPTION:${icsText(input.description)}` : null,
    "END:VEVENT",
  ]
    .filter(Boolean)
    .join("\r\n")
}

export async function GET() {
  return withRouteAuth("operations.read", async ({ companyId }) => {
    const horizonStart = new Date()
    horizonStart.setFullYear(horizonStart.getFullYear() - 1)
    horizonStart.setHours(0, 0, 0, 0)
    const horizonEnd = new Date()
    horizonEnd.setFullYear(horizonEnd.getFullYear() + 2)
    horizonEnd.setHours(0, 0, 0, 0)
    const [tasks, goals, milestones] = await Promise.all([
      prisma.organisationTask.findMany({
        where: {
          companyId,
          status: { not: "DONE" },
          OR: [{ scheduledDate: { gte: horizonStart, lt: horizonEnd } }, { dueDate: { gte: horizonStart, lt: horizonEnd } }],
        },
        orderBy: [{ scheduledDate: "asc" }, { dueDate: "asc" }],
        take: 5_001,
      }),
      prisma.organisationGoal.findMany({
        where: { companyId, status: { not: "DONE" }, periodStart: { gte: horizonStart, lt: horizonEnd } },
        orderBy: { periodStart: "asc" },
        take: 5_001,
      }),
      prisma.projectMilestone.findMany({
        where: { project: { companyId }, status: { not: "DONE" }, dueDate: { gte: horizonStart, lt: horizonEnd } },
        include: { project: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
        take: 5_001,
      }),
    ])

    const allEvents = [
      ...tasks.map((task) => event({ uid: `task-${task.id}`, title: task.title, description: task.notes, start: task.scheduledDate ?? task.dueDate! })),
      ...goals.map((goal) => event({ uid: `goal-${goal.id}`, title: `Objectif : ${goal.title}`, description: goal.description, start: goal.periodStart!, end: goal.periodEnd })),
      ...milestones.map((milestone) =>
        event({ uid: `milestone-${milestone.id}`, title: `${milestone.project.name} : ${milestone.title}`, description: milestone.description, start: milestone.dueDate! }),
      ),
    ]
    const truncated = tasks.length > 5_000 || goals.length > 5_000 || milestones.length > 5_000 || allEvents.length > 5_000
    const events = allEvents.slice(0, 5_000)
    const body = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CRM//Organisation//FR", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR", ""].join("\r\n")
    return new Response(body, {
      headers: {
        "content-type": "text/calendar; charset=utf-8",
        "content-disposition": "attachment; filename=organisation.ics",
        "cache-control": "no-store",
        "x-result-truncated": truncated ? "true" : "false",
      },
    })
  })
}
