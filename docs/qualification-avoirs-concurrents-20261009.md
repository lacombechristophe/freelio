# Qualification des avoirs concurrents

La suite `tests/unit/credit-note-concurrency.integration.test.ts` vérifie la garde existante de `createCreditNote`. Elle n'apporte pas de correctif métier ni de changement visible.

Quatre cas portent sur une facture fictive de 200 centimes : deux appels de 100 centimes, deux appels du montant complet, une demande dépassant le reliquat après un premier avoir, puis un échec de préparation d'archive suivi d'une reprise. Les assertions comparent le total des factures d'avoir, les enregistrements `CreditNote`, les audits et le nombre d'appels acceptés. Le total ne peut dépasser celui de la source ; un échec d'archive annule aussi la revendication de sa version.

Sur PostgreSQL, une barrière de test retient deux lectures initiales réelles de la même facture et vérifie qu'elles ont la même version avant de les libérer. Sur SQLite, les deux appels s'exécutent ensemble sans cette barrière ; ce moteur peut les sérialiser. Les refus admis restent ceux de la protection de version ou du reliquat. Les timeouts métier restent inchangés.

Session et cache Next sont simulés. Les actions, permissions, transactions, numérotation et audits SQL sont réels. Le rendu et le stockage d'archive sont simulés : les tests vérifient invocation, persistance et rollback, sans qualifier PDF, R2, Factur-X, remboursement bancaire ou transport fournisseur. Le jeu porte sur une TVA nulle ; les calculs multi-taux restent un périmètre distinct.

Les quatre cas passent dans la recette SQLite isolée. Le commit de tests `bfa6125` passe ensuite 1 609 tests / 187 fichiers, types et deux lints ; le code métier inchangé conserve le build réussi de `02a6e10`. La [recette locale](evidence/20261009-order-linked-invoices/credit-note-local.json) distingue ces contrôles. Les [deux CI de 369f413](evidence/20261009-order-billing-stale-balance/ci-369f413.json) passent les quatre cas sur PostgreSQL réel, avec deux lectures retenues de la même version. Ce sous-lot de qualification est clos dans le périmètre décrit. Les autres écritures financières et les relations historiques conservent leurs preuves séparées.
