export type AutomationPresetStep = {
  delayHours: number
  type: "EMAIL" | "MANUAL_EMAIL" | "CALL_TASK" | "GENERAL_TASK"
  subject: string
  bodyHtml: string
  taskTitle?: string
  taskNotes?: string
  taskPriority?: number
  pauseUntilComplete?: boolean
}

export type AutomationPresetSequence = {
  name: string
  description: string
  steps: AutomationPresetStep[]
}

export type AutomationPresetWorkflow = {
  name: string
  trigger: "LEAD_CREATED" | "EMAIL_RECEIVED" | "PORTAL_APPOINTMENT_REQUESTED" | "INTERVENTION_COMPLETED" | "CUSTOMER_HEALTH_CHANGED"
  conditions?: Record<string, unknown>
  actions: Array<Record<string, unknown>>
}

const signature = `<p>Bien cordialement,<br>L’équipe {{company.name}}</p>`

export const POOL_EMAIL_TEMPLATES = [
  {
    name: "Accueil d’une demande piscine",
    category: "PROSPECTION",
    subject: "Votre projet avec {{company.name}}",
    bodyHtml: `<p>Bonjour {{contact.firstName}},</p><p>Merci pour votre demande concernant votre projet {{lead.projectType}}. Nous allons vérifier les informations transmises et revenir vers vous avec la prochaine étape la plus utile.</p><p>Vous pouvez répondre directement à cet e-mail pour ajouter une précision, une photo ou une contrainte de calendrier.</p>${signature}`,
  },
  {
    name: "Préparation d’une visite technique",
    category: "VENTE",
    subject: "Préparons votre visite technique",
    bodyHtml: `<p>Bonjour {{contact.firstName}},</p><p>Pour rendre la visite plus efficace, pouvez-vous nous confirmer l’adresse du bassin, son accès et les équipements déjà en place ? Quelques photos d’ensemble nous aideront également à préparer le rendez-vous.</p>${signature}`,
  },
  {
    name: "Suivi après intervention",
    category: "SERVICE",
    subject: "Suite à notre intervention",
    bodyHtml: `<p>Bonjour {{contact.firstName}},</p><p>Notre intervention est terminée. Si vous constatez un point à reprendre ou souhaitez une explication sur les opérations réalisées, répondez simplement à ce message : votre demande sera rattachée au dossier.</p>${signature}`,
  },
] as const

export const POOL_AUTOMATION_SEQUENCES: AutomationPresetSequence[] = [
  {
    name: "Qualification d’un nouveau projet",
    description: "Accueillir la demande, préparer l’appel et récupérer les informations nécessaires avant le rendez-vous.",
    steps: [
      { delayHours: 0, type: "EMAIL", subject: POOL_EMAIL_TEMPLATES[0].subject, bodyHtml: POOL_EMAIL_TEMPLATES[0].bodyHtml },
      { delayHours: 24, type: "CALL_TASK", subject: "", bodyHtml: "", taskTitle: "Qualifier le projet de {{contact.firstName}} {{contact.lastName}}", taskNotes: "Confirmer le besoin, la localisation, le calendrier, le budget indicatif et les contraintes d’accès.", taskPriority: 1, pauseUntilComplete: true },
      { delayHours: 24, type: "EMAIL", subject: POOL_EMAIL_TEMPLATES[1].subject, bodyHtml: POOL_EMAIL_TEMPLATES[1].bodyHtml },
    ],
  },
  {
    name: "Réengagement d’un prospect sans réponse",
    description: "Relancer avec mesure, puis remettre le dossier dans une file manuelle avant tout nouvel envoi.",
    steps: [
      { delayHours: 0, type: "MANUAL_EMAIL", subject: "Votre projet est-il toujours d’actualité ?", bodyHtml: `<p>Bonjour {{contact.firstName}},</p><p>Je reviens vers vous au sujet de votre projet {{lead.projectType}}. Souhaitez-vous le poursuivre, le décaler ou le mettre en pause ? Une réponse courte suffit pour que nous adaptions le suivi.</p>${signature}`, taskTitle: "Valider la relance avant envoi", taskNotes: "Relire le contexte du dossier et personnaliser le message.", taskPriority: 2, pauseUntilComplete: true },
      { delayHours: 72, type: "CALL_TASK", subject: "", bodyHtml: "", taskTitle: "Dernier point avec {{contact.firstName}} {{contact.lastName}}", taskNotes: "Ne relancer que si le prospect n’a pas répondu et si le consentement est toujours valide.", taskPriority: 2, pauseUntilComplete: true },
    ],
  },
]

export const POOL_AUTOMATION_WORKFLOWS: AutomationPresetWorkflow[] = [
  {
    name: "Nouveau prospect consentant → qualification",
    trigger: "LEAD_CREATED",
    conditions: { marketingOptIn: true },
    actions: [{ type: "ENROLL_PRESET_SEQUENCE", sequenceName: "Qualification d’un nouveau projet" }],
  },
  {
    name: "Réponse client → alerter l’équipe",
    trigger: "EMAIL_RECEIVED",
    actions: [{ type: "NOTIFY_TEAM", title: "Nouvelle réponse client à traiter" }],
  },
  {
    name: "Rendez-vous portail → rappel commercial",
    trigger: "PORTAL_APPOINTMENT_REQUESTED",
    actions: [{ type: "CREATE_TASK", title: "Confirmer le rendez-vous de {{client.name}}", delayHours: 2, priority: 1 }],
  },
  {
    name: "Intervention terminée → contrôle qualité",
    trigger: "INTERVENTION_COMPLETED",
    actions: [{ type: "CREATE_TASK", title: "Contrôler le compte rendu de {{client.name}}", delayHours: 24, priority: 2 }],
  },
  {
    name: "Client à risque → plan de fidélisation",
    trigger: "CUSTOMER_HEALTH_CHANGED",
    conditions: { healthScoreBelow: 59 },
    actions: [
      { type: "CREATE_TASK", title: "Préparer un plan de suivi pour {{client.name}} · score {{health.score}}/100", delayHours: 4, priority: 1 },
      { type: "NOTIFY_TEAM", title: "Client à risque : {{client.name}} · score {{health.score}}/100" },
    ],
  },
]
