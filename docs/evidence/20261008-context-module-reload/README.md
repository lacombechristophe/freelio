# Contexte d’autorisation et modules rechargés

Les deux recettes navigateur de `fda7be9` affichent 300 € au Viewer alors que son agence ne contient que 100 €. Les [rapports](../20261008-workspace-access/ci-fda7be9.json) conservent 223 réussites, ces deux échecs et 19 exclusions sur chaque run. Leurs conclusions sont `cancelled`, après une interruption humaine ; ce ne sont pas des CI vertes. PostgreSQL passe 1 216 cas et une exclusion native SQLite, dont les 31 cas de synthèses ; Linux et les audits passent aussi.

Le [probe](reproducer.test.ts.txt) réévalue les modules avec `vi.resetModules()` en gardant le vrai client Prisma déjà instancié. Il reproduit quatre échecs sur cinq cas : un autre stockage AsyncLocalStorage est créé, la somme d’agence devient 300 €, une lecture retourne le client d’une autre société et une écriture CRM interdite réussit. Le contrôle précédant le rechargement retourne bien 100 €. Les [métadonnées](baseline.json) identifient `d8747ab`, les empreintes et les résultats, sans erreur de hook. Ce modèle de rechargement reproduit le mécanisme de cache ; la recette navigateur reste nécessaire pour valider le runtime Next compilé.

Dans une copie isolée de cette référence, avec dépendances du lockfile, base neuve et secrets fictifs, copier le probe en `tests/unit/context-module-reload.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/context-module-reload.probe.test.ts
```

La correction partage l’instance de stockage sur `globalThis`, comme le client Prisma. Les données d’autorisation restent propres à chaque chaîne asynchrone. La suite active conserve les cinq situations et ajoute le contrôle Owner, deux sociétés en parallèle et la révocation d’agence. Les huit cas passent, ainsi que sept anciens contrôles de contexte et 186 autres régressions Client/synthèses.

La première fixture omettait l’échéance obligatoire de facture ; aucune assertion produit n’était alors exécutée. Cette tentative est exclue de la baseline, la facture est corrigée et sa société/utilisateur fictifs restants sont supprimés uniquement dans la recette isolée. La comparaison valide utilise ensuite le même probe conservé.

L’hypothèse initiale d’une connexion empêchée par la session héritée n’explique pas les deux échecs réels : les connexions réussissent dans les logs. Le nettoyage des cookies de d8747ab est conservé comme initialisation explicite des rôles, sans assertion ou délai changé. Le correctif de stockage partagé et son rejeu navigateur portent la qualification du défaut de périmètre.

La correction est dans fc9c91a. Les [contrôles locaux](local.json) passent types, deux lints, 1 247 tests SQLite dans 171 fichiers et build de 75 pages. Le schéma PostgreSQL est validé sans connexion ; 244 E2E sont découverts dans 46 fichiers, sans navigateur local. Les deux [CI de 77dbf8d](../20261008-handlebars/ci-77dbf8d.json) passent ensuite 1 246 PostgreSQL et une exclusion native SQLite, dont les huit cas de contexte, ainsi que Linux. Les nouveaux avis Handlebars bloquent leurs audits avant SQLite et navigateur ; le runtime Next compilé reste donc à vérifier. Les 223 réussites de fda7be9 ne qualifient pas le correctif par avance.

Les deux [CI de a98f275](ci-a98f275.json) sont ensuite vertes avec Handlebars 4.7.10 : 1 247 SQLite, 1 246 PostgreSQL et une exclusion native, 225 E2E et 19 exclusions historiques, neuf contrôles Linux et deux audits à zéro. Les douze parcours des synthèses passent sur chaque run, dont le Viewer à 100 € sur ordinateur/mobile, le total Owner à 300 € et les compteurs de projets respectifs de un/deux. La correction du contexte est donc vérifiée dans le runtime Next compilé ; ces résultats ne qualifient pas les lecteurs ajoutés après a98f275.
