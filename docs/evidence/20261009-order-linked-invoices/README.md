# Factures déjà rattachées à une commande

Le [contrat approuvé](../../contrat-facturation-commandes-factures-liees.md) contrôle société, client et chantier des factures liées avant retour d'un acompte existant ou calcul d'un solde, puis avant la revendication transactionnelle. Il conserve les anciennes factures et refuse les incohérences sans correction automatique.

La [baseline de d88a6bb](baseline.json) passe deux témoins cohérents et échoue dans six refus attendus. Les six actions ne retournent aucune erreur. Le [probe SQL](probe.test-source.txt) décrit les références incohérentes insérées directement et les assertions sur les effets persistés. Il ne démontre pas qu'un formulaire actuel peut produire ces relations.

Pour reproduire, utiliser une copie isolée du commit, les dépendances du lockfile et une base neuve fictive, copier le probe sous `tests/unit/order-linked-invoice-probe.integration.test.ts`, puis lancer :

```sh
npm run test:unit -- tests/unit/order-linked-invoice-probe.integration.test.ts
```

La suite maintenue `order-linked-invoice.integration.test.ts` possède quatorze cas : acompte et solde avec société, client, chantier ou absence de chantier incohérents ; témoins Owner et Comptabilité ; modification du client de la facture après la lecture initiale. Les refus ne renvoient pas la référence de la facture et ne créent ni facture supplémentaire, changement d'état ni audit. Session/cache sont simulés, SQL et transactions réels. La mutation intermédiaire est injectée et ne constitue pas une course entre deux connexions.

Les factures historiques sans chantier alors que la commande en possède un nécessitent une réparation séparée. Ce lot ne répare pas les données et ne qualifie ni émission, PDF, paiement, archivage distant ni fournisseur. La qualification PostgreSQL et navigateur doit être vérifiée sur son propre candidat, indépendamment de d88a6bb.

Le correctif `02a6e10` passe la [recette locale](local.json) : quatorze cas dédiés, puis 1 605 tests / 186 fichiers, types, deux lints et compilation. Aucun nouveau parcours visuel n'est ajouté ; les E2E Finance, Comptabilité et pagination restent conservés. La qualification de d88a6bb précède ce complément et ne qualifie pas sa garde sur les factures liées.
