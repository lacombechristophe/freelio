# Rattachements de la facturation d'une commande

Le [contrat proposé](../../contrat-facturation-commandes-relations.md) reste soumis à l'accord sur le refus visible. Aucun correctif métier n'est appliqué à ce stade.

La [baseline](baseline.json), sur `3f1ca72`, passe deux témoins et échoue dans six refus attendus. Une facture brouillon, une modification de l'état de la commande et un audit sont réellement enregistrés dans chacun des six cas incohérents. Le [probe SQL](probe.test-source.txt) contrôle ces effets persistés.

Pour reproduire, utiliser une copie isolée de ce commit, une base neuve fictive et les dépendances du lockfile. Copier le probe sous `tests/unit/order-billing-reference-probe.integration.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/order-billing-reference-probe.integration.test.ts
```

Session et cache Next sont simulés ; action, DAL et SQL restent réels. Les fixtures incohérentes sont insérées directement et ne démontrent pas une création possible par les formulaires actuels. La création manuelle vérifie déjà que le chantier correspond au client. Les témoins créent des brouillons d'acompte et de solde cohérents. Aucun document n'est émis, aucun PDF n'est rendu et aucun fournisseur n'est appelé.
