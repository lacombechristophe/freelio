# Rattachements des réservations

Le correctif est dans `e25c8d155df20faefebfbe4f3f3feccf671d079e`. Le [contrat](../../contrat-reservations-relations-droits.md) décrit les relations contrôlées et les messages approuvés.

- [Avant correction](baseline.json) : neuf échecs et trois réussites sur `88ce8dd`, avec la version finale des douze cas.
- [Après correction, en local](local.json) : douze cas de rattachement et douze de concurrence réussis ; suite complète de 1 496 tests, types, lint et compilation réussis.

Pour reproduire le diagnostic, récupérer le test `tests/unit/stock-reservation-scope.integration.test.ts` depuis le commit du correctif et l'exécuter sur `88ce8dd`, dans la base fictive de recette. Pour vérifier le correctif, exécuter les deux fichiers `stock-reservation-scope.integration.test.ts` et `stock-reservation-concurrency.integration.test.ts` sur `e25c8d1`, puis les contrôles de `npm run verify`. Voir les [consignes de recette](../../../CONTRIBUTING.md) avant de créer une base de test.

Les fixtures insèrent directement les relations incohérentes. Les actions et transactions SQL sont réelles ; session et cache Next sont simulés. Aucun fournisseur externe n'est appelé. Ces résultats locaux ne qualifient pas encore PostgreSQL, le navigateur ou le conteneur pour ce correctif.
