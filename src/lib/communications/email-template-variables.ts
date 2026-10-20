export const EMAIL_TEMPLATE_VARIABLES = [
  "{{contact.firstName}}", "{{contact.lastName}}", "{{contact.email}}",
  "{{lead.projectType}}", "{{lead.city}}", "{{company.name}}",
] as const

export type EmailTemplateVariable = typeof EMAIL_TEMPLATE_VARIABLES[number]
