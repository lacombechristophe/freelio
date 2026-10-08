# Régression des scores globaux partagés

Le [probe](reproducer.test.ts.txt) exécuté sur `bf8b6ee` utilise une base SQLite isolée et crée uniquement sa société, son utilisateur et son client fictifs. Les [métadonnées](baseline.json) conservent ses 21 résultats : 17 échecs de restriction, trois contrôles positifs Owner et une suspension réussis. Le nettoyage explicite des clients précède celui de la société ; aucun échec de hook n’a été observé.

Ces résultats confirment la divulgation par cinq lecteurs Client/CRM/Service à trois rôles et par le choix de client d’Automatisations à deux rôles. Ils ne prouvent pas un défaut dans chaque champ des tableaux de bord ni dans toutes les traces d’automatisation. Le [lot approuvé](../../contrat-scores-partages-droits.md) est implémenté dans 06f88bb ; la suite active étend la couverture à 65 cas, avec les rôles supplémentaires, les filtres/tris, les variations, les simulations directes et les snapshots de société incohérents.

Pour reproduire : dans une copie isolée de cette référence, avec les dépendances du lockfile, une base neuve et des secrets fictifs, copier le probe en `tests/unit/shared-health-permissions.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/shared-health-permissions.probe.test.ts
```

Un retour non nul et les 17 assertions échouées sont attendus sur cette référence. Le probe reste hors découverte des tests actifs. Aucun fournisseur, message sortant ou navigateur n’a été utilisé pour cette régression.

La [qualification locale](local.json) distingue le probe initial des 65 cas étendus et des 68 contrôles Client préexistants. Les types, les deux lints et 1 186 tests SQLite passent ; la nouvelle CI PostgreSQL et navigateur est distincte des deux échecs de sélecteur Catalogue de 3def5cd.

Les [deux CI de 71ebdca](ci-71ebdca.json) réussissent : 1 186 SQLite, 1 185 PostgreSQL et une exclusion native SQLite, 213 E2E et les 19 exclusions historiques, neuf contrôles Linux, types/lints/build/couverture et audits à zéro. Les 65 cas SQL et vingt nouveaux cas navigateur passent sur les deux runs. La fusion de test PR a bien main et 71ebdca pour parents ; les empreintes relient les rapports au code testé. Le lot ultérieur des synthèses par domaine possède sa propre qualification.
