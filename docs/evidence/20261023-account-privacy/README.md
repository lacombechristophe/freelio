# Notifications et départ du compte

Les notifications, l’export personnel et le départ d’un membre avaient trois frontières différentes et incorrectes. Les tests utilisent de vraies requêtes SQL avec des identités et des données fictives ; la session est simulée. Ils ne constituent pas une certification RGPD.

## Défauts reproduits

- Une notification restait consultable et modifiable après révocation de l’accès à sa société. Six assertions échouaient ; deux témoins passaient. L’arrivée d’un prospect ne prévenait que 20 des 23 destinataires éligibles.
- L’export personnel suivait l’ancienne société principale de l’utilisateur et renvoyait ses dossiers métier, coordonnées bancaires et détails d’audit. Huit rôles reproduisaient la fuite, même après révocation dans cette société ; le refus sans accès actif passait.
- Le départ d’un propriétaire effaçait les coordonnées de la société et de tous ses contacts. Les deux cas de dernier propriétaire, dont celui d’une société secondaire, n’étaient pas refusés.
- Une invitation ancienne pouvait rétrograder le dernier propriétaire, élever le rôle d’un membre actif et réactiver un compte parti depuis une session périmée : trois échecs SQL, avec un témoin de réinvitation valide.

Les journaux locaux des diagnostics sont identifiés par empreinte dans la preuve de recette. Les données et secrets existants ne sont pas utilisés.

## Comportement retenu

Une notification appartient à une société **et** à son destinataire. Ces deux conditions sont composées dans le client Prisma et explicites dans les actions. Les trois producteurs renseignent la société. Une notification ancienne sans société reste conservée mais invisible : aucune attribution n’est déduite de la société actuellement sélectionnée. La restauration d’une sauvegarde ancienne contenant des notifications est refusée avant écriture ; elle ne remplace plus l’historique personnel.

La migration additive `20261023010000_notification_tenant_scope` ajoute une relation nullable et deux index. Le diff Prisma PostgreSQL correspond au DDL versionné. Une mise à niveau SQLite conserve les champs et l’empreinte d’un ancien enregistrement, avec société nulle. Cela ne prouve pas l’exécution de la migration PostgreSQL.

L’export du compte contient le profil, l’identité minimale de l’espace courant, ses notifications personnelles et les dates/types d’activité. Il exclut les dossiers partagés, secrets et payloads d’audit. L’export de société conserve son parcours administrateur distinct.

Le départ du compte est une transaction : anonymisation du profil, invalidation des sessions, retrait des moyens d’authentification et clés personnelles, désactivation des appartenances, suppression des notifications/signatures personnelles et déconnexion locale des boîtes possédées. Les autorisations OAuth en cours sont annulées. Les autres membres et leurs boîtes restent inchangés ; dossiers, documents, messages et traces d’activité partagés sont conservés. La révocation auprès des fournisseurs reste à effectuer séparément.

Un dernier propriétaire doit désigner un successeur dans chaque société. Les changements de rôle et désactivations prennent le même verrou de société avant de revérifier les propriétaires et les droits de l’acteur. Le départ et son audit obligatoire réussissent ensemble ou sont annulés ensemble. L’interface conserve la confirmation et affiche le refus au lieu d’annoncer une réussite.

Une invitation ne réécrit pas le rôle d’un membre actif. Sa transaction vérifie aussi l’adresse actuelle du compte : une session contenant encore l’ancienne adresse d’un compte parti ne peut pas le réactiver. Un membre simplement désactivé peut accepter une nouvelle invitation valide.

## Vérification et limites

La [recette de `c43b2f1`](local.json) passe **43 cas ciblés dans cinq fichiers**, puis **3 972 tests dans 296 fichiers** sur une autre SQLite neuve, sans échec ni exclusion, en 685,89 secondes. Les 1 266 fichiers de source comparés correspondent au commit. Types, ESLint/Oxlint et build propre Next.js 16.4.2 de 76 pages passent. Les 518 E2E dans 104 fichiers sont sélectionnés sans exécution navigateur.

Points d’entrée : `notifications-scope.integration.test.ts`, `account-export-scope.integration.test.ts`, `account-deactivation.integration.test.ts` et `member-mailbox-offboarding.integration.test.ts` dans `tests/unit/`.

Les cas couvrent deux sociétés, accès révoqué, boîtes privées/partagées, rôles sans administration, dernier propriétaire, départs concurrents et panne d’audit injectée en base. La concurrence locale est celle de SQLite dans un processus ; PostgreSQL et plusieurs travailleurs restent à qualifier. Aucun appel métier fournisseur ni interaction navigateur n’est exécuté.

Pour reproduire dans une copie déjà installée, définir `DATABASE_URL` vers une SQLite fictive neuve, `AUTH_SECRET` et `ENCRYPTION_KEY` avec des valeurs de test. Préparer la base avec `node scripts/prepare-dev-database.mjs`, puis lancer :

```sh
node node_modules/vitest/vitest.mjs run tests/unit/notifications-scope.integration.test.ts tests/unit/account-export-scope.integration.test.ts tests/unit/account-deactivation.integration.test.ts tests/unit/member-mailbox-offboarding.integration.test.ts tests/unit/tenant-scope.test.ts --no-file-parallelism
```

La suite complète s’exécute avec `npm run test:coverage` sur une autre base neuve. Types, lint et build se lancent séparément ; la couverture configurée concerne six modules déterministes, pas toute l’application.

La portée reste une démonstration fictive. La politique de rétention, le traitement des documents partagés et la procédure d’effacement pour une exploitation réelle demandent une décision de l’exploitant ; le bouton ne prétend pas supprimer toute donnée personnelle de tous les documents historiques.
