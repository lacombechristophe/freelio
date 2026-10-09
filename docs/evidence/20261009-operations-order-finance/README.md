# Commandes d'Opérations et droits Finance

Le [contrat approuvé](../../contrat-commandes-operations-finance.md) décrit le périmètre. La [baseline](baseline.json), sur `f88fa41`, compte neuf échecs et un témoin positif, à partir du [probe SQL](probe.test-source.txt).

Pour reproduire le diagnostic, copier ce probe sous `tests/unit/operations-order-finance-probe.integration.test.ts` dans une copie isolée de `f88fa41`, avec une base fictive préparée, puis :

```sh
npm run test:unit -- tests/unit/operations-order-finance-probe.integration.test.ts
```

Le correctif possède une suite maintenue distincte, `tests/unit/operations-order-finance.integration.test.ts`, de seize cas. Elle couvre les lectures interdites, les lectures autorisées, les commandes, la rétrogradation, la révocation d'agence et la démo publique. Session et cache Next sont simulés ; les données, le DAL et les actions sont réels. Les refus d'écriture ne sont pas des simulations de facture émise.

La [qualification locale de b32c563](local.json) passe ces seize cas, puis 1 539 tests dans 182 fichiers, types, ESLint, Oxlint et compilation. Les 27 cas des détails Service et 24 cas de réservation sont conservés. Le premier typage avait détecté deux appels de test utilisant une mauvaise signature ; les appels sont corrigés, les gardes de production restent identiques.

Les six E2E `operations-order-finance.spec.ts` utilisent des sociétés dédiées, trois rôles et deux surfaces. Ils vérifient les mentions et commandes de l'écran compilé, sans cliquer une facturation ni appeler un fournisseur. Leur résultat est qualifié dans les deux CI ci-dessous. Les prix opérationnels gardent leur définition ; autres relations, volumes et écritures financières restent distincts.

Les [deux CI de 0b6b8b3](ci-0b6b8b3.json) réussissent : seize cas PostgreSQL, six E2E Finance, 1 539 SQLite et 283 E2E au total par run ; les 19 exclusions historiques et l’exclusion PostgreSQL native restent explicites. Cette preuve qualifie son candidat et sa fusion de test, pas les changements ultérieurs de pagination.
