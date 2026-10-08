# Paiement manuel et rapprochement concurrent, 8 octobre 2026

La preuve Banque précédente couvrait ses trois actions de rapprochement. Cette recette vérifie aussi `recordPayment`, qui utilise déjà une mise à jour conditionnelle du montant, du statut et de la révision de facture. Le code métier reste inchangé : le paiement manuel concurrent peut être refusé avec la demande existante de rechargement ; le rapprochement reprend seulement un conflit de sérialisation connu.

## Invariants vérifiés

Quatre cas SQL mettent en concurrence un paiement manuel et un virement de 100 ou 200 centimes sur une facture de 200, puis deux paiements manuels partiels avec références différentes ou identiques. Le montant payé doit égaler la somme des paiements réellement persistés, ne jamais dépasser le total, et déterminer correctement SENT/PAID. Un rapprochement accepté doit pointer sur son paiement ; une opération refusée ne doit pas laisser de pointeur. Une référence partielle identique ne crée qu’un paiement.

Les refus doivent être les erreurs métier existantes de modification concurrente ou de facture déjà réglée ; une erreur SQL ou d’authentification arbitraire ne suffit pas à faire réussir le test. Au moins une opération doit être acceptée. Cette recette ne promet pas l’acceptation de toutes les demandes concurrentes.

## Instrumentation

Session et cache Next sont simulés. Membership, DAL, transactions, contraintes, lectures et écritures SQL sont réels. Sur PostgreSQL, un proxy attend les deux vrais résultats de lecture initiale de facture, l’un éventuellement hors transaction pour `recordPayment`, puis les libère. Les assertions exigent deux montants initiaux de zéro. Le proxy ne remplace aucun résultat SQL. Sur SQLite, cette barrière est inactive pour éviter de bloquer sa connexion transactionnelle unique ; les mêmes invariants de persistance sont vérifiés.

Dans une recette isolée préparée avec base neuve, lockfile et secrets fictifs :

```sh
npm run test:unit -- tests/unit/invoice-payment-concurrency.integration.test.ts
```

Les quatre cas passent localement en SQLite, types et ESLint. La barrière PostgreSQL doit encore être exécutée dans la CI du candidat suivant ; ces résultats ne lui sont pas attribués avant publication de son artifact.

La suite commune passe d’abord 957 tests / 160 fichiers en 155,80 secondes, puis 987 / 161 en 267,78 secondes après ajout du lot d’annuaire Client, avec types, ESLint et Oxlint. Ces résultats locaux ne qualifient pas la barrière PostgreSQL. Aucun test, assertion ou délai existant n’est retiré.

## Limites

Pas de paiement fournisseur réel, d’acceptation exactement une fois face à une coupure réseau, de stress sous forte contention ni de reprise du paiement manuel après une facture entièrement réglée. Avoirs, remboursements, encaissements par migration et réservations nécessitent leurs propres tests. La qualification Banque et ce test ne ferment pas toute la chaîne financière.
