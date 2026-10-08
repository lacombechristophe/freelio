# Clients imbriqués et documents du chantier

Le [contrat approuvé](../../contrat-lecteurs-client-partages.md) couvre six lecteurs : listes et détails de chantiers, temps, détails de devis, factures et contrats. Il protège les quatre métriques Client selon les droits existants, les documents du chantier selon Sales/Finance et les parents reliés à un client d’une autre société. Les budgets opérationnels restent accessibles.

La [baseline](baseline.json) est obtenue sur `fd9b281` avec les vraies actions, permissions et lectures SQL, une SQLite fictive, une session et un cache Next simulés. Elle conserve 45 assertions : 37 échecs et huit contrôles réussis, sans erreur de hook. Ces 37 assertions ne représentent pas 37 mécanismes indépendants. Les références incohérentes sont créées dans les fixtures ; leur création par les mutations courantes n’est pas établie.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des secrets fictifs, copier le [probe](reproducer.test.ts.txt) en `tests/unit/shared-client-readers.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/shared-client-readers.probe.test.ts
```

Le probe crée et supprime ses propres fixtures. Ne pas le laisser dans le répertoire de tests du candidat : il est conservé ici comme reproduction historique.

La suite active ajoute Admin, Finance limité à une agence, documents autorisés, budgets/temps, cohérence des documents imbriqués, rétrogradation et révocation d’agence. Le lecteur de l’affaire et les réponses de mutation Client réutilisent la même projection ; leurs régressions antérieures restent actives.

Quatorze parcours chantier sont préparés pour sept rôles sur ordinateur/mobile, avec des sociétés fictives distinctes des autres recettes. Ils vérifient listes et compteurs, documents autorisés et interdits, budgets/temps et page introuvable. Le build et la découverte ne prouvent pas leur exécution ; leur qualification appartient à la CI du candidat corrigé.

La correction est dans `56705d8`, les fixtures et E2E dans `1a31bf5`. La référence locale `d7bb1e2` retire aussi un import d’icône inutilisé. Les [résultats](local.json) passent 1 328 tests SQLite / 173 fichiers, 103 régressions ciblées dont les 58 cas de ce lot, types et les deux lints sans avertissement, puis le build de 75 pages. Le schéma PostgreSQL est validé sans connexion ; 266 E2E / 48 fichiers sont découverts sans navigateur local. Le contrôle de publication avant commits inspecte 1 086 fichiers et 3 134 blobs historiques, sans résultat bloquant selon ses motifs. PostgreSQL et navigateur restent à qualifier sur ce candidat.

Les [deux CI de 8ef8e79](ci-8ef8e79.json) passent ensuite 1 327 PostgreSQL et une exclusion native, dont les 58 cas de ce lot et les 23 du détail d’affaire. Les neuf contrôles Linux passent également. Le navigateur échoue : 231 réussites / 16 échecs sur la branche et 232 / 15 sur la PR, avec 19 exclusions historiques dans chacune. Les quatorze tests chantier attendent « 500 € » alors que l’écran présente correctement « 500,00 € » ; leurs attentes sont corrigées en conservant montants et assertions de droits. Les autres échecs concernent une capture Catalogue ordinateur et la capture Catalogue des onglets sur mobile. La seconde image mobile affiche l’actualisation et masque la liste ; le test attend désormais la réponse de cette action initiale et l’état chargé avant de capturer. Aucun délai, seuil ou contrôle de complétude n’est réduit. Les huit E2E du détail d’affaire passent dans les deux CI, mais cette réussite ne rend pas le candidat globalement vert.

Les [CI de 13a89e7](../20261008-contact-history/ci-13a89e7.json) passent ensuite les 58 cas PostgreSQL et les quatorze E2E chantier dans les deux runs. La PR réussit avec 263 E2E ; la branche est annulée après un timeout de synchronisation Catalogue. Cette qualification des lecteurs ne vaut pas une réussite globale de la branche.
