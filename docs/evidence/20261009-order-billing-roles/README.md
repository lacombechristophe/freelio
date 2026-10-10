# Création des factures de commande par Comptabilité

Le [contrat approuvé](../../contrat-facturation-commandes-comptabilite.md) conserve la matrice des rôles et autorise uniquement `updateMany` de `billingStatus` dans un contexte `finance.write` disposant de ce droit.

La [baseline sur 3f1ca72](baseline.json) passe quatre créations Owner/Admin et échoue pour les deux créations Comptabilité avec `FORBIDDEN:operations.write`, malgré le droit affiché dans la liste. Le [probe](probe.test-source.txt) utilise les actions et transactions réelles sur des commandes cohérentes d'une agence accessible. Les tests précédents de visibilité ne vérifiaient pas cette création effective.

Pour reproduire ce diagnostic, utiliser une copie isolée de 3f1ca72 avec une base fictive neuve, copier le probe sous `tests/unit/order-billing-role-probe.integration.test.ts`, puis lancer :

```sh
npm run test:unit -- tests/unit/order-billing-role-probe.integration.test.ts
```

La suite maintenue `order-billing-roles.integration.test.ts` vérifie dix-neuf cas : six créations, les refus des deux modes après retrait d'agence, pour Viewer et dans la démo publique, puis sept refus de mutations hors exemption. Session et cache Next sont simulés ; la DAL, les rôles et SQL sont réels. Les quatre E2E `order-billing-accounting.spec.ts` utilisent des comptes et sociétés dédiés, deux modes et deux surfaces, et ne créent que des brouillons. Leur chargement ne vaut pas exécution dans le navigateur.

Aucun élargissement général des droits Opérations, émission, PDF, paiement ou compte fournisseur ne fait partie de cette qualification. La contention forte et la cohérence des anciennes factures liées restent des sujets distincts.

Le correctif `39a3965` passe la [recette locale](local.json) : 1 591 tests / 185 fichiers, les 33 cas dédiés, types, deux lints et compilation. Les quatorze tests navigateur du périmètre (quatre Comptabilité, quatre pagination et six Finance conservés) sont chargés sans exécution locale.

Les deux [CI de d88a6bb](ci-d88a6bb.json) qualifient ensuite ce code : 1 590 tests PostgreSQL plus une exclusion native SQLite, les 33 nouveaux cas dédiés, quatre E2E Comptabilité et 291 parcours navigateur réussis avec 19 exclusions historiques dans chaque run. SQLite passe 1 591 tests / 185 fichiers, les neuf contrôles Linux, types, deux lints, build, couverture et audits réussissent. Les 958 entrées hors documentation sont identiques à la fusion de test. Le complément concernant les anciennes factures liées reste distinct et n'est pas qualifié par ces résultats.
