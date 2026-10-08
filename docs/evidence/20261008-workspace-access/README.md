# Régression des droits des espaces

Le [probe](reproducer.test.ts.txt) sur `71ebdca` crée une société fictive, un membre, deux agences, deux projets/factures et deux tickets. Actions, DAL et SQL sont réels ; session/cache Next seuls sont simulés. Les [métadonnées](baseline.json) conservent 17 échecs et six réussites sur 23 cas, avec sortie non nulle et nettoyage explicite des relations.

Les échecs portent sur les montants financiers dans des réponses CRM/Service, l’accès direct à quatre espaces sans leur droit de domaine et le compteur imbriqué de projets CRM. Les contrôles d’agence de premier niveau et Owner passent. Le [contrat approuvé](../../contrat-espaces-domaines-droits.md) distingue le probe de la correction et de sa qualification.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, une base neuve et des clés fictives, copier le probe en `tests/unit/workspace-access.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/workspace-access.probe.test.ts
```

Les 17 échecs sont attendus sur cette référence. Le probe reste hors découverte des suites actives ; aucun fournisseur, envoi ou navigateur n’a été utilisé.

La correction est dans 18b5139 ; la suite active passe 31 cas, avec quatre domaines autorisés, le lecteur commun, une rétrogradation sans changement de session et l’absence de requêtes interdites. La [qualification locale](local.json) conserve aussi 133 régressions Client/scores, les 1 217 tests de la suite complète, les lints, le build et l’identité du code hors documentation. Le probe initial reste inchangé. Les douze nouveaux cas navigateur de 7238567 sont préparés sur ordinateur/mobile ; PostgreSQL et la CI de ce candidat restent à obtenir.
