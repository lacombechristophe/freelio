# Solde calculé après modification d'un acompte

La [baseline de bfa6125](baseline.json) conserve un refus attendu en échec et les résultats SQL observés : deux factures totalisant 15 000 centimes pour une commande de 12 000, état `INVOICED` et un nouvel audit. L'acompte initial de 3 000 centimes est modifié à 6 000 entre lecture et transaction ; le nouveau solde conserve l'ancien montant de 9 000. Le [contrat proposé](../../contrat-facturation-commandes-solde-perime.md) décrit le refus visible à confirmer.

Dans une copie isolée de bfa6125 et une base neuve fictive, copier le [probe](probe.test-source.txt) sous `tests/unit/order-billing-amount-probe.integration.test.ts`, puis lancer :

```sh
npm run test:unit -- tests/unit/order-billing-amount-probe.integration.test.ts
```

Les assertions souples enregistrent les cinq écarts d'une seule régression. Elles ne comptent pas comme cinq tests. Session/cache sont simulés ; la mutation intermédiaire est injectée, avec SQL, action et transaction réels. Ce diagnostic n'est ni une mesure de contention entre deux connexions, ni une émission, un paiement ou un appel fournisseur. Les témoins cohérents des autres suites restent distincts de cette reproduction.
