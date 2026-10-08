# Rapprochements bancaires concurrents

## Défaut reproduit

Le commit **cc17e94ae4cf358d3fc20c9ca6cc3569a4c646f8** ajoute cinq cas de régression sans modifier les trois actions bancaires. Les cinq passent sur SQLite, dont la connexion sérialise les transactions interactives. Ils ne prouvent pas une absence de course sur PostgreSQL.

La [recette PostgreSQL dédiée](https://github.com/lacombechristophe/freelio/actions/runs/37779333944) échoue sur quatre cas : deux règlements de 100 laissent la facture à 100/SENT au lieu de 200/PAID ; un crédit est accepté pour deux factures ; un débit crée deux dépenses ; deux dépenses existantes sont acceptées pour le même débit. La suite compte 928 réussites, quatre échecs et une exclusion native SQLite. Le parcours nominal partiel/solde/rejeu passe.

L’instrumentation attend les vrais résultats des deux lectures avant de les libérer. Les tests exigent les deux états initiaux ; un délai de deux secondes empêche un blocage silencieux. Authentification de session et cache sont simulés ; membership, DAL, requêtes, contraintes, transactions et rollback restent réels. Le wrapper ne simule aucun résultat SQL. Cette barrière est activée uniquement sur PostgreSQL : la sérialisation SQLite rendrait une barrière interne à deux transactions impossible sur sa connexion unique.

Le job PostgreSQL terminé et son artifact conservent le défaut ; leur [synthèse et empreinte](evidence/20261008-bank-reconciliation/baseline.json) sont versionnées sans données SQL brutes. Le reste de cette exécution dédiée a ensuite été annulé ; les CI du candidat Fournisseurs 5616823 ont continué séparément. La branche temporaire de reproduction n’est pas une livraison. Le commit et les tests restent dans l’historique du candidat.

## Correction bornée

Les trois opérations de rapprochement utilisent une transaction Serializable. Seul un conflit SQL connu **P2034** peut relancer la transaction entière, au maximum trois tentatives. Chaque tentative revérifie session, membership, droit Finance, agences, correspondance et solde. Une validation, contrainte unique ou erreur de commit incertain n’est pas automatiquement rejouée. Les paiements, dépenses, pointeurs bancaires et audits perdants sont annulés ensemble. Le cache est invalidé après le commit.

Cette approche suit la [documentation Prisma 6 sur les conflits transactionnels](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions#transaction-timing-issues). Elle conserve les messages métier et les commandes d’interface existants. Aucun transport fournisseur, migration, paiement réel ni nouvelle commande visible n’est ajouté.

Les trois essais peuvent être épuisés sous contention : l’erreur reste propagée. Cette protection porte sur ces trois actions ; les autres entrées de paiement, remboursements, avoirs et réservations nécessitent leur propre qualification. Elle ne constitue pas une preuve de charge ni d’exactement une fois face à toute panne réseau.

## Qualification de la correction

La recette ciblée locale passe 53 cas Banque, dont huit cas de rapprochement. Les trois cas supplémentaires appellent chaque action sans identifiant et vérifient qu’aucune donnée n’est commise ; ils passaient déjà sur le code précédent grâce au rollback. Ils protègent cette propriété pendant l’évolution des écritures. La suite complète réussit **936 tests / 158 fichiers en 146,01 secondes**, avec types, ESLint et Oxlint. Le build génère **75 pages** et le schéma PostgreSQL est validé sans connexion. La découverte conserve 176 E2E / 40 fichiers ; ce résultat local ne qualifie pas les quatre courses PostgreSQL. Nouvelle CI requise.

Une première transformation des trois appels laissait le dernier avec des parenthèses incompatibles ; le parseur a refusé le fichier avant les tests. Les trois appels corrigés passent la même recette ciblée, sans modifier les délais, assertions ou exclusions.

Tests : [banking-reconciliation.integration.test.ts](../tests/unit/banking-reconciliation.integration.test.ts). Helper : [bank-reconciliation.ts](../src/lib/bank-reconciliation.ts). Actions : [bank/index.ts](../src/actions/bank/index.ts).
