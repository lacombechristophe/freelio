# Rattachements de la facturation d'une commande

Le [contrat](../../contrat-facturation-commandes-relations.md) a été approuvé le 9 octobre 2026. La baseline conserve le comportement antérieur au correctif.

La [baseline](baseline.json), sur `3f1ca72`, passe deux témoins et échoue dans six refus attendus. Une facture brouillon, une modification de l'état de la commande et un audit sont réellement enregistrés dans chacun des six cas incohérents. Le [probe SQL](probe.test-source.txt) contrôle ces effets persistés.

Pour reproduire, utiliser une copie isolée de ce commit, une base neuve fictive et les dépendances du lockfile. Copier le probe sous `tests/unit/order-billing-reference-probe.integration.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/order-billing-reference-probe.integration.test.ts
```

Session et cache Next sont simulés ; action, DAL et SQL restent réels. Les fixtures incohérentes sont insérées directement et ne démontrent pas une création possible par les formulaires actuels. La création manuelle vérifie déjà que le chantier correspond au client. Les témoins créent des brouillons d'acompte et de solde cohérents. Aucun document n'est émis, aucun PDF n'est rendu et aucun fournisseur n'est appelé.

La suite maintenue `order-billing-references.integration.test.ts` ajoute aux cas initiaux le chantier d'un autre client local, un changement de client du chantier après la lecture initiale et les commandes sans chantier pour Owner. Quatorze cas vérifient la cohérence et l'absence de facture, changement d'état ou audit lors des refus. La modification injectée entre les lectures vérifie la relecture transactionnelle ; elle ne constitue pas un test de contention entre deux connexions.

Le correctif `39a3965` et la [recette commune](../20261009-order-billing-roles/local.json) passent 33 cas dédiés puis 1 591 tests / 185 fichiers, types, deux lints et compilation. Les deux [CI de d88a6bb](../20261009-order-billing-roles/ci-d88a6bb.json) qualifient les quatorze cas de rattachement sur PostgreSQL réel, ainsi que les dix-neuf cas de rôles et les quatre E2E Comptabilité. Un premier essai du test de modification intermédiaire échouait avant son injection, car le proxy Prisma n'expose pas `$transaction` au spy Vitest ; l'injection porte désormais sur la lecture réelle du délégué. Les assertions métier et les timeouts sont conservés.
