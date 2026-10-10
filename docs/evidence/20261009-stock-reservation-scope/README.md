# Rattachements des réservations

Le correctif est dans `e25c8d155df20faefebfbe4f3f3feccf671d079e`. Le [contrat](../../contrat-reservations-relations-droits.md) décrit les relations contrôlées et les messages approuvés.

- [Avant correction](baseline.json) : neuf échecs et trois réussites sur `88ce8dd`, avec la version finale des douze cas.
- [Après correction, en local](local.json) : douze cas de rattachement et douze de concurrence réussis ; suite complète de 1 496 tests, types, lint et compilation réussis.

Pour reproduire le diagnostic, récupérer le test `tests/unit/stock-reservation-scope.integration.test.ts` depuis le commit du correctif et l'exécuter sur `88ce8dd`, dans la base fictive de recette. Pour vérifier le correctif, exécuter les deux fichiers `stock-reservation-scope.integration.test.ts` et `stock-reservation-concurrency.integration.test.ts` sur `e25c8d1`, puis les contrôles de `npm run verify`. Voir les [consignes de recette](../../../CONTRIBUTING.md) avant de créer une base de test.

Les fixtures insèrent directement les relations incohérentes. Les actions et transactions SQL sont réelles ; session et cache Next sont simulés. Aucun fournisseur externe n'est appelé. La qualification locale reste distincte de la CI ci-dessous.

Les [deux CI de 0b6b8b3](../20261009-operations-order-finance/ci-0b6b8b3.json) passent les douze cas de rattachement et douze cas de concurrence sur PostgreSQL réel. Elles qualifient aussi le navigateur et le conteneur de ce candidat ; elles ne constituent pas une charge multi-processus.
