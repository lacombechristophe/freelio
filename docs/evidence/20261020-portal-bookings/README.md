# Réservation de rendez-vous CRM

Le commit `73b299deb499fe9e55c4fbabbb2f38bb11df9489` applique le [parcours retenu](../../contrat-reservation-portail.md) : une demande du portail devient un rendez-vous CRM affecté à un membre, sans créer d’intervention terrain ni exiger un site. La confirmation, le contrôle de capacité, la version et l’audit sont atomiques. Une annulation conserve le créneau historique et libère sa capacité.

Le verrou de membre est partagé avec création, replanification, changement d’état et import des interventions affectées. Un conflit privé produit un refus générique. Une réaffectation intercalée pendant un import invalide sa préparation. Les autres tâches Organisation et les calendriers externes ne sont pas des sources de disponibilité ; cette limite est affichée avant confirmation.

Les lecteurs de la fiche Client, du portail et de l’agenda sont paginés par 25. Le choix du membre est recherché sur tous les membres admissibles et conservé hors page ; les saisies sont conservées après refus. La préférence et le créneau confirmé sont distincts. L’export ICS contient les instants UTC réservés. Une ancienne confirmation sans créneau reste historique ; la migration ne lui attribue ni membre ni horaire.

Le [relevé local](local.json) conserve les résultats, les empreintes des rapports natifs et leurs limites. Le diagnostic initial comporte quatre défauts sur cinq cas : absence de réservation, de conflit, de version attendue et de données obligatoires. Le premier passage global relève ensuite six attentes exactes de DTO à compléter avec `crmWrite` ; la matrice de droits n’est pas assouplie. Les erreurs de fixtures et leurs corrections restent également identifiées.

La suite finale passe **2 729 tests dans 240 fichiers**, sans échec ni exclusion, sur une SQLite neuve. Les 62 cas dédiés couvrent règles d’accès, capacité, révisions, dates, lecteurs et affichage ; les suites voisines vérifient aussi l’import et les anciens contrats d’accès. Types, ESLint, Oxlint et build réussissent, avec 76 pages statiques. Les six modules de couverture configurés dépassent leurs seuils inchangés ; ils ne représentent pas la couverture de toute l’application. Les 1 122 fichiers source de la recette correspondent au commit.

La vérification d’évolution crée une nouvelle base externe avec quatre demandes historiques. Elle conserve toutes leurs anciennes colonnes, laisse les quatre nouveaux champs à `NULL`, vérifie l’index et les clés étrangères. Le schéma PostgreSQL est valide et la migration correspond à son diff généré hors connexion ; elle n’est pas encore exécutée sous PostgreSQL.

Reproduction avec Node 24, dépendances déjà installées et copie de recette sans `.env`, pointant sur une **nouvelle SQLite fictive** :

```powershell
$env:DATABASE_URL = "file:./portal-proof-$([guid]::NewGuid().ToString('N')).db"
$env:AUTH_SECRET = "fictional-isolated-verification-secret-only"
$env:ENCRYPTION_KEY = 'a' * 64
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
node scripts/verify-portal-booking-upgrade.mjs
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src tests scripts/verify-portal-booking-upgrade.mjs
node node_modules/oxlint/bin/oxlint .
node --max-old-space-size=4096 --import ./scripts/build-memory.mjs node_modules/next/dist/bin/next build --webpack
```

Auth.js, le cache Next et les notifications sont simulés selon les suites ; les adhésions, lectures, écritures, contraintes et transactions Prisma sont réelles. Les appels concurrents SQLite et l’intercalage déterministe de l’import ne qualifient pas la contention PostgreSQL. Les 446 cas navigateur, 223 par surface, sont sélectionnés sans exécution ; le parcours Portail comprend désormais demande, confirmation, lecture publique, ICS et annulation.

Aucun push, workflow, déploiement, fournisseur, abonnement ni stockage R2 n’est déclenché. Le plafond GitHub Actions à 0 € reste à vérifier avant nouvelle CI. Le lot MAIL-02 et la qualification distante restent ouverts.
