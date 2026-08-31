# Runbook de production — Freelio CRM/ERP

Date de référence : 24 août 2026
Propriétaire opérationnel à nommer : responsable de production de l’entreprise cliente
Périmètre : application Next.js, PostgreSQL, R2, Resend, Redis/BullMQ et Upstash.

Ce document décrit l'exploitation du code présent dans ce dépôt. Il ne vaut pas preuve de mise en production : l'hébergeur, les accès, les objectifs de reprise et les alertes doivent encore être renseignés dans la fiche d'environnement.

## 1. Fiche d'environnement à compléter

| Élément | Production | Préproduction |
|---|---|---|
| URL publique | à renseigner | à renseigner |
| Hébergeur application | à renseigner | à renseigner |
| Projet PostgreSQL | à renseigner | à renseigner |
| Bucket R2 | à renseigner | à renseigner |
| Instance Redis/BullMQ | à renseigner | à renseigner |
| Instance Upstash | à renseigner | à renseigner |
| Domaine Resend | à renseigner | à renseigner |
| Gestionnaire de secrets | à renseigner | à renseigner |
| Responsable astreinte | à renseigner | à renseigner |
| Canal incident | à renseigner | à renseigner |
| RPO / RTO validés | à renseigner | sans objet |

Préproduction et production doivent utiliser des bases, buckets, clés et domaines d'envoi distincts. Une archive HubSpot/Extrabat réelle ne doit jamais être déposée dans un environnement de développement non maîtrisé.

## 2. Topologie attendue

```text
Utilisateurs / site public
          │ HTTPS
          ▼
   Application Next.js ───────────────► Resend
          │       │                     (liens magiques)
          │       ├───────────────────► Upstash Redis
          │       │                     (rate limiting partagé)
          │       ├───────────────────► Cloudflare R2 privé
          │       │                     (documents et archives)
          │       └───────────────────► Redis / BullMQ ──► Worker Node.js
          ▼
     PostgreSQL
```

Contraintes :

- Node.js `>= 20.9.0` ;
- exécution Node.js complète, pas un runtime Edge ;
- environnement capable d'exécuter Puppeteer/Chromium pour les PDF ;
- processus worker séparé si le flux BullMQ de génération de documents est utilisé ;
- PostgreSQL et R2 obligatoires en production ;
- TLS de bout en bout et bucket non public.

Le dépôt ne fournit pas actuellement de `Dockerfile` ni de manifeste d'infrastructure. Il expose `GET /api/health/live` pour la vie du processus et `GET /api/health/ready` pour la base et la configuration critique ; la plateforme choisie doit documenter sa commande de démarrage, la disponibilité de Chromium et le branchement effectif de ces sondes.

## 3. Secrets et variables obligatoires

Utiliser [.env.example](../.env.example) comme inventaire, pas comme fichier de production. Enregistrer les valeurs dans le gestionnaire de secrets de l'hébergeur.

### Bloquants au démarrage métier

- `DATABASE_URL` : PostgreSQL avec TLS ;
- `AUTH_SECRET` et URL canonique d'authentification ;
- `ENCRYPTION_KEY` : clé stable protégeant l'IBAN et les identifiants de sources ;
- `JWT_SECRET` : secret indépendant pour les jetons applicatifs ;
- `CONSENT_TOKEN_SECRET` : secret dédié d'au moins 32 caractères pour les liens publics de désinscription ; le repli technique sur `JWT_SECRET`/`AUTH_SECRET` ne doit pas être le choix de production ;
- `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` et `EMAIL_FROM` pour les e-mails CRM, les événements et le lien magique optionnel ;
- `PUBLIC_LEAD_COMPANY_ID` : facultatif tant que la base contient exactement une société, obligatoire dès qu’il faut router les demandes publiques entre plusieurs sociétés ;
- `PUBLIC_APP_URL`, `PUBLIC_PRIVACY_NOTICE_URL`, `CRON_SECRET` et `AUTOMATION_CRON_SECRET` ;
- `SCHEDULER_CRON_SECRET` si une clé distincte est souhaitée pour l’ordonnanceur métier ; sinon la route utilise `AUTOMATION_CRON_SECRET` ;
- `LEAD_HASH_SALT` et `LEAD_INGEST_SECRET` ;
- `FILE_STORAGE_DRIVER=r2` et `MIGRATION_STORAGE_DRIVER=r2` ;
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ATELIER` et `STRIPE_PRICE_RESEAU` avant d’ouvrir les offres payantes.

### Requis selon la topologie

- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` : obligatoires dès que plusieurs instances servent du trafic ou que la capture publique est ouverte ;
- `REDIS_HOST` et `REDIS_PORT` : obligatoires pour BullMQ ;
- `GEMINI_API_KEY` : seulement pour l'OCR des justificatifs.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` ou `MICROSOFT_CLIENT_ID` / `MICROSOFT_CLIENT_SECRET` : seulement lorsqu’une boîte correspondante doit être autorisée ; enregistrer exactement `https://<domaine>/api/integrations/email/oauth/callback`, conserver l’accès hors ligne et ne jamais afficher le canal comme actif avant le consentement OAuth et la vérification de l’identité.
- `COMMUNICATIONS_CRON_SECRET` : secret Bearer dédié à la synchronisation planifiée des boîtes OAuth ; son absence replie explicitement sur `AUTOMATION_CRON_SECRET`.

Ne jamais afficher les valeurs lors d'un diagnostic. Vérifier uniquement leur présence, leur date de rotation et l'accès au service cible.

### CORS du bucket R2 privé

Les archives volumineuses sont envoyées directement du navigateur vers une URL `PUT` présignée afin de ne pas traverser la limite de taille des fonctions Vercel. Le bucket doit donc autoriser uniquement l’origine de production et les en-têtes signés utilisés par l’application. Exemple à adapter à `PUBLIC_APP_URL` (ajouter `http://localhost:3000` uniquement sur un bucket de développement) :

```json
[
  {
    "AllowedOrigins": ["https://freelio-eight.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": [
      "Content-Type",
      "x-amz-meta-sha256",
      "x-amz-meta-company",
      "x-amz-meta-run"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Ne pas utiliser `*` pour l’origine du bucket de production. Après modification, vérifier le prévol et un transfert réel depuis le domaine canonique ; les URL présignées expirent après quinze minutes et la règle CORS peut demander quelques secondes pour se propager.

### Rotation

| Secret | Rotation | Précaution |
|---|---|---|
| `AUTH_SECRET`, `JWT_SECRET`, `CONSENT_TOKEN_SECRET` | après incident ou selon politique | invalide les sessions ou liens dépendants ; conserver la clé de consentement le temps de validité métier des liens émis |
| `ENCRYPTION_KEY` | uniquement avec procédure de rechiffrement testée | une rotation brute rend les données chiffrées illisibles |
| Resend, Upstash, Redis, R2 | régulière et après incident | faire une rotation chevauchante si le fournisseur le permet |
| clés HubSpot/Extrabat | à la fin de la bascule | révoquer après archivage final et validation |

Conserver une copie sécurisée de secours de `ENCRYPTION_KEY` et documenter les personnes autorisées à y accéder.

## 4. Déploiement standard

### 4.1 Préconditions

- commit et branche à déployer identifiés ;
- revue et contrôles automatisés verts ;
- aucune migration non relue ;
- sauvegarde PostgreSQL native prise et restauration déjà éprouvée ;
- capacité R2 et PostgreSQL vérifiée ;
- fenêtre de changement annoncée ;
- responsable du rollback disponible.

### 4.2 Vérification de l'artefact

Dans un environnement propre :

```powershell
npm ci
npm run db:generate
npx tsc --noEmit
npm run lint
npm test -- --run
npm run build
```

Les scénarios Playwright doivent être exécutés sur une base isolée et une URL de préproduction, jamais sur la production.

### 4.3 Base PostgreSQL

Vérifier puis appliquer uniquement les migrations versionnées :

```powershell
npm run db:status:postgres
npm run db:deploy:postgres
```

Ne pas lancer `prisma db push` sur la production. Pour une ancienne base issue du modèle mono-utilisateur, exécuter `npm run db:backfill-memberships` une fois, après sauvegarde et contrôle en préproduction.

### 4.4 Application et worker

1. Déployer l'application avec `npm start` après le build.
2. Si BullMQ est utilisé, déployer séparément `npm run worker` avec les mêmes accès PostgreSQL, R2 et Redis.
3. Vérifier que le worker s'arrête proprement sur `SIGTERM`.
4. Conserver l'ancienne version disponible jusqu'à la fin du smoke test.

Le worker peut traiter les séquences e-mail et synchroniser les boîtes OAuth toutes les cinq minutes. `vercel.json` programme la sauvegarde quotidienne `GET /api/backup/process` avec `CRON_SECRET`, compatible avec l’offre Hobby. Les traitements `GET /api/automations/process` (toutes les cinq minutes recommandé), `GET /api/communications/sync/process` (toutes les cinq minutes recommandé) et `GET /api/scheduling/process` (horaire recommandé) doivent être confiés à Vercel Pro, au worker ou à un ordonnanceur externe approuvé. Les variantes `POST` restent disponibles avec le même contrôle Bearer. Ne pas ouvrir les séquences ni annoncer la synchronisation continue tant que ces mécanismes ne sont pas observés et alertés.

Une archive logique téléchargée depuis R2 se contrôle et se déchiffre hors production avec `npm run backup:decrypt -- <archive.json.gz.enc> [sortie.json]`. La commande refuse d’écraser une sortie existante et vérifie le manifeste SHA-256 avant d’écrire le JSON. Elle doit utiliser la même `ENCRYPTION_KEY` que l’environnement ayant produit l’archive. La route de restauration web est désactivée par défaut en production ; `ENABLE_IN_APP_RESTORE=true` ne doit être utilisé que dans un environnement isolé, sans envoi d’e-mails ni trafic public, et reste limité à 4 Mo. Les archives plus grandes suivent exclusivement la recette de restauration ci-dessous.

### 4.5 Smoke test après déploiement

Effectuer avec un compte de recette non privilégié puis avec chaque rôle critique :

- `/auth/login` répond sans erreur ;
- `/api/health/live` répond `200` et `/api/health/ready` répond `200` sans exposer de détail de configuration ;
- création d’un compte de recette, connexion par mot de passe et rejet d’un mot de passe incorrect ;
- si Resend est activé, lien magique reçu et utilisable une fois ;
- si la réception e-mail est activée, webhook signé reçu, événement dédoublonné et réponse rattachée au bon client ;
- si Google ou Microsoft est activé, consentement OAuth avec la bonne adresse, envoi test, synchronisation manuelle puis passage du cron contrôlés ;
- dashboard, clients, pipeline, projets, opérations, factures et migrations chargent ;
- isolation des rôles : un profil sans permission ne peut pas muter le domaine ;
- création puis suppression d'un prospect de recette ;
- génération et lecture d'un PDF de recette dans R2 ;
- création d'un petit fichier projet, lecture puis suppression ;
- capture d'un lead depuis une origine autorisée ;
- génération depuis la file prospects d'un lien de désinscription, retrait public puis second appel idempotent ;
- une requête depuis une origine non autorisée reçoit `403` ;
- logs application et worker sans boucle d'erreurs ;
- un passage des deux ordonnanceurs crée les échéances dues et un second passage ne crée aucun doublon ;
- aucun secret, e-mail complet ou donnée client sensible dans les logs.

Noter le commit, l'heure, les opérateurs et le résultat de chaque contrôle.

## 5. Retour arrière d'un déploiement

Déclencher le rollback si une fonction P0 est indisponible, si des écritures sont incohérentes, si l'authentification est ouverte à tort ou si une fuite de données est suspectée.

1. Fermer les entrées publiques à risque ou placer l'application en maintenance au niveau de l'hébergeur.
2. Arrêter le worker pour éviter de nouvelles écritures asynchrones.
3. Capturer les logs, l'heure de début et les identifiants des opérations touchées.
4. Si aucune migration irréversible n'a été appliquée, redéployer l'artefact précédent.
5. Si le schéma ou les données ont été altérés, restaurer la sauvegarde dans une **nouvelle** base, contrôler les volumes et les montants, puis repointer l'application.
6. Vérifier les objets R2 créés pendant l'incident avant toute suppression ; ne jamais effacer le bucket en masse.
7. Rejouer le smoke test et communiquer l'état réel aux utilisateurs.

Une migration destructive ne doit pas dépendre d'un simple rollback applicatif. Son plan inverse ou sa restauration doivent être prouvés en préproduction avant déploiement.

## 6. Sauvegardes et restauration

### 6.1 Source de vérité

- PostgreSQL contient les données métier et les manifestes ;
- R2 contient les fichiers, PDF et archives de migration ;
- le gestionnaire de secrets contient les clés indispensables au déchiffrement ;
- Redis/BullMQ est une file de travail, pas une source de vérité.

L'export de réversibilité disponible depuis les paramètres inventorie les tables rattachables à la société, collecte les fichiers locaux/R2 lisibles et produit un manifeste d'intégrité. Il exclut volontairement les sessions, jetons OAuth et certains modèles globaux qui ne peuvent pas être isolés sûrement par société. C'est une preuve de portabilité utile, mais pas un remplacement des sauvegardes natives PostgreSQL/R2 ni du PITR.

### 6.2 Politique minimale recommandée à faire valider

- PostgreSQL : sauvegarde quotidienne, restauration à un instant donné si le fournisseur le permet, rétention d'au moins 35 jours ;
- R2 : versioning ou protection équivalente, inventaire quotidien et rétention conforme aux besoins légaux ;
- export hors fournisseur régulier de la base et de l'inventaire des objets ;
- secrets : sauvegarde chiffrée hors de la plateforme d'exécution ;
- test de restauration trimestriel et avant chaque bascule majeure.

Les durées exactes doivent être validées avec l'expert-comptable et le référent RGPD.

### 6.3 Recette d'une restauration

1. Restaurer PostgreSQL vers une base isolée.
2. Brancher une préproduction sans accès aux formulaires publics ni aux e-mails réels.
3. Vérifier les comptages par modèle et l'existence des relations critiques.
4. Contrôler un échantillon de devis, commandes, factures, paiements, stocks, interventions et contrats.
5. Lire un échantillon de fichiers R2 et recalculer leur SHA-256 lorsqu'il est stocké.
6. Exécuter les scénarios P0.
7. Mesurer le temps réel de restauration et le comparer au RTO.
8. Faire signer le procès-verbal par l'opérateur et un représentant métier.

Ne restaurez jamais une archive métier dans la base de production active via une requête navigateur. Le flux HTTP est volontairement borné ; les restaurations réelles partent d’un clone PostgreSQL isolé et d’un inventaire R2 vérifié.

## 7. Supervision et alertes

Le code journalise côté serveur, mais n'intègre pas à lui seul une plateforme complète d'observabilité. Configurer au minimum :

- disponibilité et temps de réponse de `/api/health/live` et `/api/health/ready` ;
- taux de réponses `5xx`, `401/403` anormaux et `429` ;
- saturation et connexions PostgreSQL, réplication et échecs de sauvegarde ;
- erreurs et latence R2 ;
- file BullMQ en attente, jobs échoués et worker absent ;
- échecs Resend et taux de livraison des liens magiques ;
- volume de leads accepté et chute anormale de capture ;
- lots de migration en `FAILED`, `PARTIAL` ou `VERIFICATION_FAILED` ;
- échéances récurrentes en retard, erreurs du planificateur et absence de passage du worker/cron ;
- espace et coûts anormaux ;
- erreurs CSP et tentatives répétées sur les liens publics.

Niveaux conseillés :

| Niveau | Exemple | Réponse |
|---|---|---|
| P0 | fuite suspectée, corruption, authentification contournée | couper l'entrée concernée, alerter immédiatement, préserver les preuves |
| P1 | vente/facturation/stock indisponible | prise en charge immédiate pendant les heures définies, procédure manuelle |
| P2 | OCR, PDF asynchrone ou service externe dégradé | contourner manuellement, corriger sans bloquer les autres domaines |
| P3 | défaut cosmétique ou rapport secondaire | backlog planifié |

## 8. Procédures d'incident

### Authentification ou Resend indisponible

- vérifier le statut fournisseur et la validité du domaine ;
- la connexion par mot de passe reste disponible sans Resend ; ne jamais créer de mot de passe en clair ni activer la porte de recette sans les trois variables CI prévues ;
- si le lien magique est utilisé, contrôler la présence de `VerificationToken`, `RESEND_API_KEY`, `EMAIL_FROM` et l’URL canonique ;
- conserver les sessions existantes si elles ne présentent pas de risque ;
- utiliser une procédure métier hors ligne validée pour les urgences ;
- après retour, tester un lien neuf et un lien expiré.

### PostgreSQL indisponible ou incohérent

- suspendre les écritures ;
- ne pas relancer une migration ou un import à l'aveugle ;
- prendre un snapshot de l'état défaillant ;
- basculer vers une restauration vérifiée dans une nouvelle base ;
- rapprocher les opérations réalisées pendant la coupure avant réouverture.

### R2 indisponible

- bloquer les nouveaux imports et uploads si l'écriture n'est pas fiable ;
- ne pas marquer un document comme archivé sans manifeste ;
- conserver les fichiers en attente dans une zone chiffrée approuvée ;
- après retour, vérifier taille et SHA-256 avant rattachement.

### Redis/worker indisponible

- arrêter d'ajouter des travaux si la file n'est pas joignable ;
- les routes PDF synchrones existantes peuvent être utilisées uniquement si elles ont été validées pour le cas métier ;
- redémarrer un seul worker, observer les doublons et les jobs échoués ;
- le même processus exécute le worker documentaire et le processeur des séquences e-mail ; après reprise, contrôler les échéances en attente et les envois idempotents ;
- la route `POST /api/automations/process` protégée par `AUTOMATION_CRON_SECRET` permet un déclenchement de secours par un ordonnanceur approuvé.
- la route `POST /api/scheduling/process` protégée par `SCHEDULER_CRON_SECRET` ou son repli documenté permet de rattraper les visites et factures récurrentes ; son rejeu doit rester idempotent.

### Capture de leads interrompue

- vérifier `PUBLIC_LEAD_COMPANY_ID`, les origines, Upstash et PostgreSQL ;
- activer temporairement un canal de collecte approuvé sur le site public ;
- conserver l'heure et les demandes reçues hors outil pour reprise contrôlée ;
- tester origine autorisée, secret serveur, honeypot, doublon et limite de débit avant réouverture.
- tester aussi la création d'un lien depuis la file prospects, son retrait public, sa relecture idempotente et la preuve `WITHDRAWN` avant réouverture.

### Import de migration défaillant

- ne pas relancer avant lecture des `MigrationIssue` et du rapport ;
- conserver le lot et ses archives brutes ;
- restaurer la base si un lot a écrit des données incorrectes : le code ne fournit pas de suppression atomique par lot ;
- corriger le mapping en préproduction, rejouer sur une restauration propre, puis replanifier.

## 9. Entretien périodique

### Quotidien

- disponibilité, erreurs P0/P1, sauvegardes, jobs échoués et leads entrants.

### Hebdomadaire

- anomalies de migration ouvertes, documents illisibles, factures en erreur, stocks négatifs ou réservations bloquées ;
- membres actifs et invitations en attente ;
- mises à jour de sécurité critiques.

### Mensuel

- rapprochement financier avec l'expert-comptable ;
- contrôle de capacité PostgreSQL/R2/Redis ;
- revue des accès, fournisseurs et secrets à expirer ;
- export d'un rapport d'audit et revue des incidents.

### Trimestriel

- restauration complète ;
- test des rôles et de l'isolation société ;
- test des liens de signature expirés/utilisés ;
- mise à jour du runbook et exercice de continuité.

## 10. Gate « prêt pour la production »

La production n'est approuvée que lorsque chaque ligne possède une preuve datée :

- environnement et responsables renseignés ;
- build, typecheck, lint, tests unitaires et E2E critiques verts ;
- PostgreSQL/R2/Resend/Upstash/Redis validés ;
- sauvegarde et restauration mesurées ;
- rôles testés avec de vrais profils ;
- capture depuis le site public et parcours de signature testés ;
- PDF et Factur-X relus ;
- supervision et alertes reçues par un humain ;
- procédure manuelle pour vente, stock, intervention et encaissement ;
- limites de la [matrice de couverture](coverage-and-external-dependencies.md) acceptées ;
- décision de mise en production signée par le responsable technique et le gérant.
