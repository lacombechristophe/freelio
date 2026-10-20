import "server-only"
import { z } from "zod"
import prisma from "@/lib/prisma"
import { hasPermission, normalizeCompanyRole } from "@/lib/permissions"
import { emailContentPreflight } from "@/lib/communications/email-preflight"
import { CampaignManagementError } from "./campaign-management"

type Step = { position: number; type: string; subject: string | null; bodyHtml: string | null }
export class CampaignContentPreflightError extends CampaignManagementError {}
export function sequenceContentPreflight(steps: Step[]) {
  const rows = steps.filter(step => step.type === "EMAIL").map(step => ({ position: step.position,
    ...emailContentPreflight(step.subject || "", step.bodyHtml || "") }))
  return { ok: rows.every(row => row.ok), emailSteps: rows.length, linkCount: rows.reduce((total, row) => total + row.linkCount, 0),
    errors: rows.reduce((total, row) => total + row.issues.filter(issue => issue.level === "ERROR").length, 0),
    warnings: rows.reduce((total, row) => total + row.issues.filter(issue => issue.level === "WARNING").length, 0), rows }
}

export function assertSequenceContentReady(steps: Step[]) {
  const report = sequenceContentPreflight(steps)
  const failed = report.rows.find(row => !row.ok)
  if (failed) throw new CampaignContentPreflightError(`Étape ${failed.position + 1} : ${failed.issues.find(issue => issue.level === "ERROR")!.message}`)
}

export async function readCampaignContentPreflight(companyId: string, userId: string, input: unknown) {
  const data = z.object({ campaignId: z.string().cuid(), sequenceId: z.string().cuid() }).strict().parse(input)
  return prisma.$transaction(async tx => {
    const member = await tx.membership.findUnique({ where: { companyId_userId: { companyId, userId } }, select: { role: true, status: true } })
    const role = normalizeCompanyRole(member?.role || "")
    if (!member || member.status !== "ACTIVE" || !hasPermission(role, "automation.read")) throw new CampaignManagementError("Accès Automatisations requis")
    const campaign = await tx.marketingCampaign.findFirst({ where: { companyId, id: data.campaignId }, select: { id: true } })
    const sequence = campaign && await tx.emailSequence.findFirst({ where: { companyId, id: data.sequenceId, campaignId: campaign.id },
      select: { id: true, name: true, steps: { orderBy: { position: "asc" }, select: { position: true, type: true, subject: true, bodyHtml: true } } } })
    if (!sequence) throw new CampaignManagementError("Campagne ou séquence inaccessible")
    const report = sequenceContentPreflight(sequence.steps)
    const issues = report.rows.flatMap(row => row.issues.map(issue => ({ ...issue, position: row.position })))
    return { sequenceId: sequence.id, sequenceName: sequence.name, checkedAt: new Date().toISOString(),
      ok: report.ok, emailSteps: report.emailSteps, linkCount: report.linkCount, errors: report.errors, warnings: report.warnings,
      issues: issues.slice(0, 100), issueCount: issues.length }
  })
}
