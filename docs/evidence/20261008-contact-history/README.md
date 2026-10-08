# Historiques de communication dans Contacts

La [baseline](baseline.json) de `8ef8e79` conserve 21 assertions, avec 17 échecs et quatre réussites sans erreur de hook. Le [contrat approuvé](../../contrat-contacts-historiques-droits.md) distingue les droits de domaine des bornes de société et de la confidentialité des boîtes.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des secrets fictifs, copier le [probe](reproducer.test.ts.txt) en `tests/unit/contact-read-scope.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/contact-read-scope.probe.test.ts
```

La session est simulée ; les vraies actions, permissions et lectures SQL sont utilisées. Le probe crée et supprime uniquement ses fixtures. Les relations incohérentes sont des cas de lecture de données anciennes, sans conclusion sur leur création par les mutations actuelles. Le probe est archivé ici et retiré du dossier de découverte des tests.

La correction est dans `95a2e1c`, les fixtures et seize E2E dans `83bb0f0`. Les [preuves locales de e7b6b57](local.json) passent les 36 cas de `tests/unit/contact-read-scope.integration.test.ts`. Le rejeu ciblé conserve aussi les trois contrôles de confidentialité de `mailbox-access.integration.test.ts` et les quatre tests d’annuaire existants : 43 réussites, zéro échec. La suite complète passe 1 364 tests dans 174 fichiers. Les métriques de la fiche restent calculées sur ses historiques récents, comme avant ce correctif.

Les [CI de 13a89e7](ci-13a89e7.json) passent les 36 régressions Contacts sur PostgreSQL et les seize E2E sur ordinateur/mobile dans chacun des deux runs. Les 58 cas SQL et quatorze E2E chantier passent également. La PR termine avec 263 E2E réussis et 19 exclusions historiques ; PostgreSQL passe 1 363 tests et une exclusion native SQLite, les deux suites SQLite passent 1 364 tests, les neuf contrôles Linux et les deux audits à zéro réussissent.

La branche est cependant annulée après 35 minutes. Son test Catalogue ordinateur expire dans `beforeEach` : la pile pointe `await refresh.finished()`, alors que la réponse POST est 200 et le DOM affiche déjà « 603 résultats » et « Page 1 sur 25 ». Le flux n’est pas terminé dans la trace réseau. Le parcours des onglets mobile reste ensuite en attente avant Catalogue ; son helper utilise la même attente, mais aucune trace mobile n’est conservée pour confirmer la cause. Les 251 réussites, un échec et 18 exclusions émises sont des comptes partiels. Les 930 entrées Git hors documentation sont identiques entre le candidat et la fusion de test PR ; cela ne rend pas l’échec négligeable.

Le test attend désormais la réponse puis l’état rendu, avec une borne de quinze secondes sur la réponse. Il conserve pagination, compteurs, capture complète et contrôle de débordement. Il n’attend plus la fermeture du flux RSC ; cette correction de synchronisation doit être exécutée dans une nouvelle CI.
