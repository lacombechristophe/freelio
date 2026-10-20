import type { getMarketingCampaignContentPreflight } from "@/actions/campaigns"

export type CampaignContentReport = NonNullable<Awaited<ReturnType<typeof getMarketingCampaignContentPreflight>>>

export function CampaignContentReportView({ report }: { report: CampaignContentReport }) {
  const quota = report.dispatch.quota
  return <div className="space-y-2 rounded-md border bg-background p-3 text-sm" role="status">
    <p className="font-medium">Contenu de « {report.sequenceName} » : {report.ok ? "aucun blocage détecté" : "corrections requises"}</p>
    <p>{report.emailSteps} étape(s) e-mail · {report.linkCount} lien(s) · {report.errors} blocage(s) · {report.warnings} avertissement(s)</p>
    {report.issues.length ? <ul className="list-disc space-y-1 pl-5">{report.issues.map((issue, index) => <li key={index}>Étape {issue.position + 1} · {issue.field === "subject" ? "Objet" : "Contenu"} · {issue.level === "ERROR" ? "Bloquant" : "Attention"} · {issue.message}</li>)}</ul> : null}
    {report.issueCount > report.issues.length ? <p>{report.issues.length} premiers résultats sur {report.issueCount}. Tous les contrôles ont été pris en compte.</p> : null}
    <p className="font-medium">Envoi : {report.dispatch.message}</p>
    {quota?.version ? <div className="space-y-1 text-xs">
      <p>Plafonds internes · version {quota.version} · {quota.enabled ? "actifs" : "désactivés"}</p>
      {quota.windows.map(window => <p key={window.period}>{window.period === "DAY" ? "Jour UTC" : "Minute UTC"} : {window.used} / {window.period === "DAY" ? quota.dailyRecipientLimit : quota.minuteRecipientLimit} destinataire(s) admis · prochaine période {new Date(window.resetAt).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC</p>)}
    </div> : null}
    <p className="text-xs text-muted-foreground">Ces valeurs décrivent la configuration locale au moment du contrôle. Aucun destinataire ni quota n’est réservé par ce rapport ; les plafonds seront vérifiés à nouveau avant chaque envoi. L’activation revérifie aussi la boîte et la configuration des plafonds.</p>
    <p className="text-xs text-muted-foreground">Contrôle syntaxique du contenu et des liens conservés. Les liens n’ont pas été ouverts ; la disponibilité des domaines, la délivrabilité et les quotas fournisseur ne sont pas vérifiés. Le contenu sera contrôlé de nouveau avant activation et après personnalisation.</p>
  </div>
}
