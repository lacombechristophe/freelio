import type { getMarketingCampaignContentPreflight } from "@/actions/campaigns"

export type CampaignContentReport = NonNullable<Awaited<ReturnType<typeof getMarketingCampaignContentPreflight>>>

export function CampaignContentReportView({ report }: { report: CampaignContentReport }) {
  return <div className="space-y-2 rounded-md border bg-background p-3 text-sm" role="status">
    <p className="font-medium">Contenu de « {report.sequenceName} » : {report.ok ? "aucun blocage détecté" : "corrections requises"}</p>
    <p>{report.emailSteps} étape(s) e-mail · {report.linkCount} lien(s) · {report.errors} blocage(s) · {report.warnings} avertissement(s)</p>
    {report.issues.length ? <ul className="list-disc space-y-1 pl-5">{report.issues.map((issue, index) => <li key={index}>Étape {issue.position + 1} · {issue.field === "subject" ? "Objet" : "Contenu"} · {issue.level === "ERROR" ? "Bloquant" : "Attention"} · {issue.message}</li>)}</ul> : null}
    {report.issueCount > report.issues.length ? <p>{report.issues.length} premiers résultats sur {report.issueCount}. Tous les contrôles ont été pris en compte.</p> : null}
    <p className="text-xs text-muted-foreground">Contrôle syntaxique du contenu et des liens conservés. Les liens n’ont pas été ouverts ; la disponibilité des domaines, la délivrabilité et les quotas fournisseur ne sont pas vérifiés. Le contenu sera contrôlé de nouveau avant activation et après personnalisation.</p>
  </div>
}
