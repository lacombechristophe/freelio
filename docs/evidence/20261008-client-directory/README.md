# Annuaire Client : régression avant/après

Sur `3be747db3eae72f04ae359fcabf9bb2d8c2a9bc6`, les deux lecteurs retournent les montants de factures à trois rôles dépourvus de `finance.read`. [Huit cas SQL initiaux](baseline.json) : six échecs pour Technicien/SAV/Commercial, deux réussites Owner/Comptabilité. Session et cache simulés ; SQL, DAL, membership et agence réels. Le [lot visible](../../contrat-annuaire-client-droits.md) a ensuite été approuvé. La [suite étendue de trente cas](expanded.json) reproduit vingt échecs sur les lecteurs précédents, puis aucune erreur après correction ; sa [qualification](../../qualification-annuaire-client-droits-20261008.md) distingue SQLite et CI.

Le [reproducer initial](reproducer.test.ts.txt) reste volontairement hors suite de qualification et ne compte dans aucune réussite. La version étendue corrigée appartient à `tests/unit/client-directory-permissions.integration.test.ts`. Pour reproduire le défaut initial dans une copie isolée du commit, avec base neuve, dépendances du lockfile et secrets fictifs :

```sh
cp docs/evidence/20261008-client-directory/reproducer.test.ts.txt tests/unit/client-directory-permissions.integration.test.ts
npm run test:unit -- tests/unit/client-directory-permissions.integration.test.ts
```

Le code de retour attendu avant correction est non nul. Ne pas exécuter cette préparation dans une instance contenant ses données existantes. Les empreintes de lecteur, test et rapport sont dans la synthèse ; aucun résultat SQL brut n’est publié. Cette preuve ne qualifie ni la charge des tris calculés, ni les autres lecteurs CRM.
