# CRM/ERP Freelio

CRM/ERP vertical destiné aux piscinistes, conçu pour réunir dans un même outil la relation client, la vente, les chantiers, le stock, le parc installé, le SAV, l’entretien et la facturation. L’identité affichée provient du profil entreprise ; aucune marque cliente n’est codée en dur dans l’interface. Le dépôt contient aussi un centre de reprise contrôlée des données HubSpot et Extrabat.

L'objectif produit est de rendre les abonnements HubSpot et Extrabat résiliables. La résiliation ne doit toutefois intervenir qu'après une reprise réelle des comptes de l’entreprise pilote, une recette métier et la validation des dépendances externes listées dans la [matrice de couverture](docs/coverage-and-external-dependencies.md).

## Fonctions disponibles

- capture des prospects depuis le site public, sources/UTM, anti-doublon et preuve de consentement ;
- modèles d’e-mail, séquences multi-étapes, règles CRM, journal d’envoi et désinscription automatique ;
- clients, contacts, sites d'installation, activités et prochaines actions ;
- pipeline commercial avec responsables, échéances, forecast pondéré et motifs de perte, devis versionnés, contrats, avenants structurés et signature publique par jeton ;
- conversion devis → commande client → facture d'acompte ou de solde ;
- projets, modèles de chantier, étapes datées, dépendances, responsables, relevé technique, documents et réception ;
- fournisseurs, gammes, variantes, options, nomenclatures, tarifs historisés, dépôts, achats multi-lignes approuvés, accusés, réceptions, anomalies, retours, mouvements et réservations de stock ;
- configurateur de devis avec options obligatoires, coût de nomenclature, remises contrôlées et marge unitaire ;
- équipements installés, tickets SAV, planning anti-conflit, capacité, tournées chronologiques, coûts horaires et terrain PWA hors ligne avec photos, consommation atomique du stock, frais et justificatifs, réserves, signature manuscrite, rapports PDF et preuves client ;
- contrats d’entretien avec visites et factures récurrentes idempotentes, préavis, indexation et propositions de renouvellement signables ;
- factures, règlements, avoirs, relances, récurrence, dépenses, import bancaire et Factur-X ;
- équipe multi-utilisateur avec rôles et permissions par domaine, agences opérationnelles et dépôts rattachés ;
- centre de migration HubSpot/Extrabat : connexion, dépôt d'archives, analyse, simulation, import idempotent, rapprochement et rapport de vérification ;
- stockage local en développement et Cloudflare R2 en production.

Les fonctions non couvertes ou seulement partielles sont documentées sans ambiguïté dans [docs/coverage-and-external-dependencies.md](docs/coverage-and-external-dependencies.md).

## Architecture

- Next.js 16 et React 19, exécution Node.js ;
- TypeScript strict et Server Actions ;
- Prisma 6 ; SQLite pour le développement local, PostgreSQL pour la production ;
- Auth.js avec lien magique Resend en production et connexion e-mail locale en développement ;
- stockage objet compatible S3 via Cloudflare R2 ;
- Redis/BullMQ pour la génération asynchrone de documents ;
- Puppeteer, PDF-lib et Factur-X pour les documents commerciaux ;
- Vitest et Playwright pour les contrôles automatisés.

Le code choisit le client Prisma à partir de `DATABASE_URL` : une URL `file:` utilise SQLite ; une URL `postgresql://` ou `postgres://` utilise le client PostgreSQL généré.

## Prérequis

- Node.js `>= 20.9.0` ;
- npm ;
- PostgreSQL pour un environnement partagé ou de production ;
- Redis si le flux de génération asynchrone est utilisé ;
- un bucket R2 privé en production ;
- une clé Resend et un domaine d'envoi validé en production.

## Démarrage local

Sous PowerShell :

```powershell
Copy-Item .env.example .env
npm ci
npm run db:generate
npx prisma db push --schema prisma/schema.prisma
npm run dev
```

Ouvrir [http://localhost:3000](http://localhost:3000). En développement uniquement, l'écran de connexion accepte une adresse e-mail locale et ne dépend pas de Resend.

Ne jamais committer `.env`, `.env.local`, une clé HubSpot/Extrabat, une sauvegarde ou une archive client.

## Commandes utiles

| Commande | Usage |
|---|---|
| `npm run dev` | serveur local Next.js |
| `npm run build` | génération Prisma puis build de production |
| `npm start` | serveur de production après build |
| `npm run worker` | worker BullMQ de génération de devis/factures |
| `npm run db:generate` | synchronise les deux schémas et génère les clients Prisma |
| `npm run db:status:postgres` | affiche l'état des migrations PostgreSQL |
| `npm run db:deploy:postgres` | applique les migrations PostgreSQL déjà versionnées |
| `npm run db:backfill-memberships` | crée les memberships à partir des anciens rattachements utilisateur/société |
| `npm run typecheck` | contrôle TypeScript strict sans émission |
| `npm run lint` | contrôle ESLint |
| `npm run test:unit` | tests unitaires en un passage |
| `npm run verify` | Prisma, types, lint, tests unitaires et build de production |
| `npm run test:e2e` | scénarios Playwright desktop et mobile |

Pour une vérification complète avant mise en production :

```powershell
npm run db:generate
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Les tests E2E nécessitent une base isolée préparée avec `npx tsx scripts/seed-e2e.mjs`. Ne jamais pointer Playwright vers la base de production. Le compte de recette utilise `E2E_USER_EMAIL` et `E2E_USER_PASSWORD` (valeurs locales sûres par défaut).

Le workflow GitHub Actions [`.github/workflows/ci.yml`](.github/workflows/ci.yml) reproduit cette chaîne sur une base SQLite éphémère à chaque push et pull request.

## Configuration

Le fichier [.env.example](.env.example) décrit toutes les variables lues par l'application. Les exigences essentielles de production sont :

- `DATABASE_URL` sur PostgreSQL avec TLS ;
- secrets indépendants `AUTH_SECRET`, `ENCRYPTION_KEY`, `JWT_SECRET`, `CONSENT_TOKEN_SECRET`, `LEAD_HASH_SALT` et `LEAD_INGEST_SECRET` ;
- `PUBLIC_LEAD_COMPANY_ID` égal à l'identifiant réel de la société destinataire du formulaire ;
- `PUBLIC_APP_URL`, `PUBLIC_PRIVACY_NOTICE_URL` et `AUTOMATION_CRON_SECRET` pour les liens publics et le processeur de séquences ;
- `SCHEDULER_CRON_SECRET` facultatif pour séparer le déclenchement des visites/factures récurrentes ; sans lui, la route utilise `AUTOMATION_CRON_SECRET` ;
- `FILE_STORAGE_DRIVER=r2` et `MIGRATION_STORAGE_DRIVER=r2` avec les quatre paramètres R2 ;
- `RESEND_API_KEY` et `EMAIL_FROM` ;
- Upstash Redis pour un rate limiting partagé entre instances ;
- Redis/BullMQ si les tâches documentaires asynchrones sont activées.

Les secrets d'une connexion HubSpot ou Extrabat sont saisis dans le centre de migration et chiffrés en base avec `ENCRYPTION_KEY`. Une rotation de cette clé sans procédure de rechiffrement rendrait ces connexions illisibles.

## Base de données

### Développement

Le schéma source est [prisma/schema.prisma](prisma/schema.prisma) et utilise SQLite. `npx prisma db push` convient au poste local, mais ne constitue pas une stratégie de migration de production.

### Production

Le script `db:generate` produit le schéma PostgreSQL miroir dans `prisma/postgresql/schema.prisma`. Les migrations versionnées se trouvent sous `prisma/postgresql/migrations`.

Ordre de déploiement :

```powershell
npm ci
npm run db:generate
npm run db:status:postgres
npm run db:deploy:postgres
npm run build
npm start
```

Avant `db:deploy:postgres`, prendre une sauvegarde PostgreSQL native et tester sa restauration. L'export de réversibilité applicatif versionne les tables société, les fichiers et leur manifeste d'intégrité, avec des exclusions de sécurité explicites ; il ne remplace pas les sauvegardes natives PostgreSQL/R2 du plan de reprise.

## Capture des prospects du site

Le point d'entrée public est `POST /api/public/leads`. Il accepte du JSON ou un formulaire encodé, uniquement depuis une origine de `LEAD_ALLOWED_ORIGINS` ou avec `Authorization: Bearer <LEAD_INGEST_SECRET>`.

Exemple minimal :

```json
{
  "firstName": "Camille",
  "lastName": "Martin",
  "email": "camille@example.fr",
  "phone": "+33600000000",
  "postalCode": "44000",
  "city": "Nantes",
  "projectType": "Couverture de piscine",
  "message": "Demande de rappel",
  "source": "WEBSITE",
  "privacyAccepted": true,
  "marketingOptIn": false
}
```

Le champ invisible `website` peut servir de honeypot. La politique de confidentialité affichée au prospect doit correspondre à `PUBLIC_PRIVACY_NOTICE_URL`. Depuis la file `/dashboard/leads`, un utilisateur autorisé peut copier pour chaque consentement actif un lien public signé de désinscription ; le retrait est idempotent, arrête les séquences actives et crée une nouvelle preuve de consentement.

## Automatisations et séquences

Le centre `/dashboard/automatisations` gère les modèles, séquences multi-étapes, e-mails automatiques ou manuels, appels, tâches, délais, jours ouvrés, fenêtres d’envoi, fuseaux, inscriptions consenties, règles déclenchées par les événements CRM et journal d’envoi. Une étape manuelle peut bloquer la suite jusqu’à sa réalisation dans Organisation. Chaque inscription peut être mise en pause, reprise ou arrêtée individuellement, avec prochaine échéance et motif visibles. Chaque étape expose ses volumes livrés, ouverts, cliqués, en erreur ou ses tâches terminées. Les e-mails ajoutent un lien de désinscription signé et un en-tête `List-Unsubscribe` ; tout retrait arrête les inscriptions actives.

Le worker traite les échéances chaque minute. Les étapes manuelles fonctionnent même sans fournisseur e-mail ; les étapes d’envoi utilisent la messagerie active la plus récemment configurée (Resend, Google Workspace ou Microsoft 365). Le composeur manuel permet de choisir explicitement la boîte. Une plateforme de cron peut aussi appeler `POST /api/automations/process` avec `Authorization: Bearer <AUTOMATION_CRON_SECRET>`.

Dans `/dashboard/communications`, chaque entreprise peut fournir ses propres clés Resend ou autoriser sa boîte Google/Microsoft par OAuth avec PKCE, sans transmettre son mot de passe. Les secrets et jetons sont chiffrés au repos, l’adresse réellement autorisée est vérifiée et la synchronisation entrante/sortante peut être déclenchée manuellement ou par `GET|POST /api/communications/sync/process` avec `COMMUNICATIONS_CRON_SECRET` (repli sur `AUTOMATION_CRON_SECRET`). Pour Resend, la clé doit permettre l’accès complet si la réception est utilisée ; une clé limitée à l’envoi suffit sinon. Le webhook signé reste `/api/webhooks/resend`.

Les workflows peuvent contenir une branche conditionnelle avec chemin vrai et chemin alternatif. L’activation publie un instantané versionné ; la simulation sur un prospect affiche les conditions, le chemin choisi et les actions prévues sans produire aucun effet externe.

Le même worker planifie toutes les cinq minutes les visites d’entretien et les factures récurrentes arrivées à échéance. Un ordonnanceur externe peut appeler `POST /api/scheduling/process` avec `SCHEDULER_CRON_SECRET`, ou `AUTOMATION_CRON_SECRET` si aucun secret distinct n’est défini. Les occurrences et visites portent une clé métier persistante pour rendre un rejeu sans doublon.

## Service client et fidélisation

Le centre de support regroupe les files SAV, priorités, responsables et engagements de première réponse/résolution. La politique se configure dans Paramètres avec fuseau, horaires, jours ouverts, fermetures et objectifs par priorité. Les échéances sont calculées en heures ouvrées ; le statut « En attente » suspend les deux horloges sans compter nuits, week-ends ou jours fermés. Les dossiers ticket, intervention et équipement restent reliés au client et aux preuves terrain. La base de connaissances distingue les contenus internes des articles publiés dans le portail client et nettoie le HTML côté serveur.

La fiche ticket contient une chronologie conversationnelle : fils e-mail rattachés, messages entrants/sortants, statuts de délivrabilité et notes internes séparées. L’équipe peut rattacher un fil existant ou répondre depuis le ticket ; les réponses suivantes restent dans le même dossier grâce aux en-têtes du fil.

Les macros SAV centralisent les réponses fréquentes avec objet, corps et variables de contexte (ticket, contact, client, responsable et société). Leur insertion remplit le composeur sans envoyer automatiquement : l’utilisateur garde l’aperçu, la personnalisation et la validation finale. L’affectation intelligente tient compte des compétences, territoires, disponibilité, capacité et charge courante de chaque membre ; son motif reste visible sur le ticket et une urgence peut utiliser une capacité de débordement contrôlée.

La fiche SAV calcule aussi les doublons probables du même client à partir de l’équipement, du site, de la proximité des objets/descriptions et de la date de création. La fusion est manuelle et non destructive : le ticket écarté passe en lecture seule, son historique est agrégé au dossier conservé, l’action est auditée et une restauration remet immédiatement le dossier dans son statut précédent.

Les guides de diagnostic SAV sont configurables par entreprise et ciblables par gamme, fabricant, famille de modèle, symptôme et mots-clés. Le ticket explique la suggestion, distingue les contrôles obligatoires des contrôles optionnels, présente la consigne adaptée au statut de garantie et exige une conclusion humaine. Chaque diagnostic conserve un instantané du guide, du matériel, des contrôles validés et de l’auteur afin que les évolutions futures de la bibliothèque ne réécrivent jamais l’historique.

Le portefeuille Customer Success calcule une santé client explicable à partir de règles propres à l’entreprise : tickets ouverts ou hors délai, volume SAV récent, satisfaction normalisée, ancienneté de la dernière activité, encours échu, renouvellement et contrats actifs. Chaque seuil expose sa mesure, sa comparaison et son impact ; le score peut être historisé, filtré par niveau de risque et relié à un responsable, un renouvellement, une prochaine action, un plan de succès et une opportunité d’extension.

Le recalcul de santé publie aussi un événement d’automatisation idempotent lorsqu’un score évolue. Une règle active peut filtrer le niveau atteint, un score maximal ou une baisse minimale, puis créer une tâche client ou notifier l’équipe. Les titres acceptent les variables client, score actuel, score précédent et niveau de santé ; une simulation sur un client vérifie les conditions sans produire d’effet.

Les analyses Service distinguent les tickets créés, les clôtures de la période et le backlog actif, puis évaluent les SLA de première réponse et de résolution en incluant les objectifs échus sans action. La vue propose les flux hebdomadaires, les temps moyens ouvrés, la performance par responsable et priorité, la couverture des diagnostics, les guides utilisés, la satisfaction globale et la distribution de santé. La période, le responsable et la priorité sont filtrables par URL pour permettre le partage d’une lecture stable.

L’export des analyses reprend exactement ces filtres dans une archive ZIP privée : six CSV séparés et un manifeste JSON décrivent le résumé, l’équipe, les priorités, la tendance, les diagnostics et la santé. Chaque fichier possède sa taille et son empreinte SHA-256 ; le contenu CSV neutralise les cellules pouvant être interprétées comme des formules et chaque téléchargement est inscrit au journal d’audit.

Les contrats d’entretien gèrent désormais leur renouvellement comme une nouvelle période liée à l’ancienne : préavis, indexation, autorisation automatique, décision et notes restent explicites. La proposition possède son propre PDF et son lien de signature ; l’accord signé autorise ensuite la création du nouveau terme. Une reconduction conserve le terme précédent, calcule les nouvelles dates et le tarif indexé, reprend les équipements et recrée la facturation récurrente lorsqu’elle était active. Une transaction sérialisable empêche les doubles propositions ou renouvellements concurrents.

Un contrat signé peut recevoir un avenant sans être modifié : chaque changement conserve sa catégorie, sa valeur avant/après, son impact financier éventuel et sa date d’effet. L’avenant possède un numéro, un PDF, une signature et une empreinte d’intégrité distincts, tandis que la fiche du contrat source garde la chaîne complète des documents associés.

Les listes commencent à utiliser des vues enregistrées persistantes : une vue conserve recherche, filtres, tri et colonnes sous une configuration validée côté serveur, reste isolée par entreprise et peut être réappliquée après rechargement. Le partage équipe est réservé aux administrateurs.

Le centre Satisfaction gère des enquêtes CSAT, NPS ou CES. Chaque invitation peut être rattachée à un client, un contact et un ticket ; son lien contient un jeton aléatoire conservé uniquement sous forme hashée, expire automatiquement et n’accepte qu’une réponse. Les notes, taux de satisfaction et verbatims remontent dans le tableau Service.

## Reprise HubSpot et Extrabat

Le centre de migration est réservé aux rôles disposant de `migration.manage` :

1. enregistrer et tester une connexion, ou créer un lot manuel ;
2. archiver les exports bruts ;
3. analyser et contrôler les anomalies ;
4. simuler le mapping ;
5. importer ;
6. lancer la vérification ;
7. télécharger le rapport JSON et conserver son empreinte.

Le connecteur HubSpot sait découvrir les objets standards et personnalisés accessibles, puis lancer des exports CRM asynchrones. Le connecteur Extrabat ne dispose pas d'une documentation API publique assez complète pour automatiser une extraction générique : l'application teste une URL officielle fournie au compte, tandis que la reprise complète s'appuie sur les exports structurés et la restitution demandée à Extrabat.

La procédure opératoire, les contrôles et le retour arrière sont détaillés dans [docs/migration-cutover-runbook.md](docs/migration-cutover-runbook.md).

## Exploitation

Le [runbook de production](docs/production-runbook.md) couvre le déploiement, les sauvegardes, la supervision, les incidents et la rotation des secrets. Principes non négociables :

- application et worker déployés sur une plateforme Node.js compatible avec Puppeteer ;
- base PostgreSQL et bucket R2 sauvegardés séparément ;
- test de restauration périodique ;
- migrations et imports exécutés par un administrateur identifié ;
- aucune résiliation HubSpot/Extrabat avant signature des critères de bascule.

La plateforme peut sonder `GET /api/health/live` pour la vie du processus et `GET /api/health/ready` pour la connexion base et la présence d’une configuration de production sûre. Ces réponses n’exposent ni valeur de secret ni détail de connexion.

## Documentation projet

- [Plan directeur de remplacement](tasks/diskoov-crm-replacement-master-plan.md)
- [Plan technique de reprise](tasks/diskoov-data-transfer-plan.md)
- [Plan d’achèvement des automatisations et du durcissement](docs/automation-completeness-hardening-plan.md)
- [Runbook de production](docs/production-runbook.md)
- [Runbook de migration et bascule](docs/migration-cutover-runbook.md)
- [Matrice de couverture et dépendances externes](docs/coverage-and-external-dependencies.md)
- [Rapport de vérification du candidat](docs/verification-report.md)

## Avertissements métier

Factur-X est généré, mais l'émission réglementaire nécessite encore une plateforme agréée choisie et intégrée. L'application ne tient pas une comptabilité générale certifiée et ne remplace ni l'expert-comptable, ni une validation juridique, fiscale ou RGPD. Ces points sont des gates explicites de mise en production, pas des fonctions supposées.
