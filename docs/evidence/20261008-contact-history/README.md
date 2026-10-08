# Historiques de communication dans Contacts

La [baseline](baseline.json) de `8ef8e79` conserve 21 assertions, avec 17 échecs et quatre réussites sans erreur de hook. Le [contrat approuvé](../../contrat-contacts-historiques-droits.md) distingue les droits de domaine des bornes de société et de la confidentialité des boîtes.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des secrets fictifs, copier le [probe](reproducer.test.ts.txt) en `tests/unit/contact-read-scope.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/contact-read-scope.probe.test.ts
```

La session est simulée ; les vraies actions, permissions et lectures SQL sont utilisées. Le probe crée et supprime uniquement ses fixtures. Les relations incohérentes sont des cas de lecture de données anciennes, sans conclusion sur leur création par les mutations actuelles. Le probe est archivé ici et retiré du dossier de découverte des tests.

La correction est dans `95a2e1c`, les fixtures et seize E2E dans `83bb0f0`. Les [preuves locales de e7b6b57](local.json) passent les 36 cas de `tests/unit/contact-read-scope.integration.test.ts`. Le rejeu ciblé conserve aussi les trois contrôles de confidentialité de `mailbox-access.integration.test.ts` et les quatre tests d’annuaire existants : 43 réussites, zéro échec. La suite complète passe 1 364 tests dans 174 fichiers. Les seize nouveaux E2E Contacts sont seulement découverts localement ; leur exécution et PostgreSQL doivent encore qualifier le candidat publié. Les métriques de la fiche restent calculées sur ses historiques récents, comme avant ce correctif.
