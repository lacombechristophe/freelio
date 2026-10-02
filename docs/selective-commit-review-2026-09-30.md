# Sélection Git vérifiée — 30 septembre 2026

À la demande de l’utilisateur, seuls trois lots ont été retenus : correction des
exclusions Vercel, intégrité des imports et documents, traduction de l’interface.
Les portions de traduction ont été isolées dans l’index lorsque les fichiers
contenaient également des modifications de design. La refonte, ses nouveaux
composants et ses changements fonctionnels restent dans le répertoire de travail.

La sélection exacte de l’index a été exportée dans une copie temporaire ignorée,
sans les changements non sélectionnés ni les fichiers d’environnement :

- `npm run verify` réussi : types, lint, 350 tests dans 80 fichiers et build.
- Tests navigateur de traduction réussis sur ordinateur et mobile, avec la base
  QA locale existante ; aucune donnée de production utilisée.
- Les 23 tests ciblés des imports, du stockage et des PDF passent également.
- Les URL, identifiants techniques et données métier ne sont pas traduits.
- Les sélecteurs E2E suivent les libellés français ; l’ancre technique `#workflow`
  reste inchangée. L’assertion de score santé n’impose plus une valeur dépendant
  d’une date de renouvellement passée.

Cette sélection est destinée à `codex/production-hardening-20260922`, sans fusion
dans `main` ni nouvelle publication de production. Elle ne remplace pas la recette
complète des imports réels, du SaaS ou de la refonte restée locale.
