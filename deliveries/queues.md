# Delivery #4: Plan des Queues BullMQ

Freelio utilise Redis + BullMQ pour déporter les tâches lourdes ou asynchrones, garantissant une UI fluide et une exécution fiable (zéro perte de document).

## 1. File `DOC_GEN` (Documents Légaux)
Responsable de la création des fichiers PDF et de l'encodage XML Factur-X.
- **Jobs** : `GENERATE_QUOTE`, `GENERATE_INVOICE`, `GENERATE_CONTRACT`.
- **Worker Policy** : Puppeteer instances limitées pour éviter de saturer la RAM.
- **Retry** : 3 tentatives, délai exponentiel (1m, 5m, 15m) en cas de crash Puppeteer.

## 2. File `EMAILS` (Communications)
Responsable de l'envoi via l'API Resend/SMTP.
- **Jobs** : `SEND_MAGIC_LINK`, `SEND_INVOICE`, `SEND_RELANCE`, `SEND_NOTIF`.
- **Worker Policy** : Rate limiting aligné sur les quotas fournisseur (Resend).
- **Retry** : 5 tentatives, délai fixe (30s) pour absorber les timeouts API temporaires.

## 3. File `RECURRENCE` (Automation Facturation)
Responsable du trigger de création de documents périodiques.
- **Jobs** : `CHECK_DAILY_RECURRENCES`, `PROJECT_KPI_REFRESH`.
- **Schedule** : 
    - `CHECK_DAILY_RECURRENCES` : Chaque jour à 02:00 UTC.
- **Logic** : Lit la table `RecurringInvoice`, crée l'occurrence en base, puis émet un job dans `DOC_GEN`.

## 4. File `ARCHIVE` (Sécurité & Immuabilité)
Responsable du stockage longue durée (WORM) sur Cloudflare R2.
- **Jobs** : `UPLOAD_TO_R2`, `COMPUTE_DOCUMENT_HASH`, `PDP_TRANSMISSION`.
- **Retry** : 3 tentatives.
- **Critical** : En fin de job, le lien R2 et le hash SHA-256 sont inscrits définitivement dans le record Prisma.

## 5. File `AI_PROCESS` (Vision & NLP)
Responsable des appels à Gemini Pro Vision.
- **Jobs** : `OCR_EXPENSE_VISION`, `GENERATE_COPY_SUGGESTION`.
- **Rate Limit** : 30 appels/heure par utilisateur (configuré via BullMQ global limit).
- **Fallback** : En cas d'échec AI, le job est marqué "Manual Attention Required", l'utilisateur saisit manuellement.
