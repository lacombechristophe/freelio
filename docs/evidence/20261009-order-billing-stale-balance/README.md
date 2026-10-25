# Solde calculé après modification d'un acompte

La [baseline de bfa6125](baseline.json) conserve un refus attendu en échec et les résultats SQL observés : deux factures totalisant 15 000 centimes pour une commande de 12 000, état `INVOICED` et un nouvel audit. L'acompte initial de 3 000 centimes est modifié à 6 000 entre lecture et transaction ; le nouveau solde conserve l'ancien montant de 9 000. Le [contrat approuvé](../../contrat-facturation-commandes-solde-perime.md) décrit le refus visible.

Dans une copie isolée de bfa6125 et une base neuve fictive, copier le [probe](probe.test-source.txt) sous `tests/unit/order-billing-amount-probe.integration.test.ts`, puis lancer :

```sh
npm run test:unit -- tests/unit/order-billing-amount-probe.integration.test.ts
```

Les assertions souples enregistrent les cinq écarts d'une seule régression. Elles ne comptent pas comme cinq tests. Session/cache sont simulés ; la mutation intermédiaire est injectée, avec SQL, action et transaction réels. Ce diagnostic n'est ni une mesure de contention entre deux connexions, ni une émission, un paiement ou un appel fournisseur. Les témoins cohérents des autres suites restent distincts de cette reproduction.

Le correctif `061173c` compare les identifiants, types, statuts et TTC des factures à leur lecture transactionnelle, avant toute revendication de commande. Le retour d'un acompte existant est également recontrôlé. Les rattachements société/client/chantier restent vérifiés. Une divergence refuse l'opération, conserve la modification intermédiaire et n'ajoute ni facture, ni changement d'état, ni audit.

La suite maintenue `tests/unit/order-billing-stale-balance.integration.test.ts` couvre six cas : acompte et solde, chacun avec montant modifié, statut modifié et témoin inchangé. Les reprises utilisent les valeurs actuelles. La [qualification locale](local.json) passe ces cas, puis 1 615 tests / 188 fichiers, types, deux lints et build. Un premier test témoin tentait à tort un deuxième solde après réussite ; il a été corrigé pour examiner le premier résultat, sans modifier la garde métier. Les [deux CI de 369f413](ci-369f413.json) qualifient ensuite les six cas sur PostgreSQL réel, la suite SQLite, les 291 E2E et les neuf contrôles Linux. Le premier échec Linux de branche sur quota ECR et la relance réussie sont conservés dans le rapport. Les 19 exclusions navigateur et l’exclusion native SQLite restent explicites.
