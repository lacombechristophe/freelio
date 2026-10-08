# Régression financière de Suivi client

Sur le candidat `653cddc6c03fd8f3cf73c6fc12e07696181fb545`, le cas Owner réussit ; Technicien et SAV reçoivent chacun le montant de renouvellement et l’encours échu sans `finance.read`, soit quatre assertions de restriction échouées. Les [résultats et empreintes](baseline.json) ne sont pas présentés comme une suite réussie.

Le [reproducer initial](reproducer.test.ts.txt) reste archivé hors suite verte. Le [lot visible](../../contrat-suivi-client-droits.md) a ensuite été approuvé ; la [suite étendue](comparison.json) reproduit 21 échecs sur 26 cas puis 26 réussites après correction. Sa [qualification](../../qualification-suivi-client-droits-20261008.md) distingue ces étapes et les moteurs. Dans une copie isolée de 653cddc avec base neuve, dépendances du lockfile et secrets fictifs :

```sh
cp docs/evidence/20261008-customer-success-permissions/reproducer.test.ts.txt tests/unit/customer-success-permissions.probe.test.ts
npm run test:unit -- tests/unit/customer-success-permissions.probe.test.ts
```

Le retour attendu est non nul. La recette courante a supprimé son fichier temporaire après exécution et nettoyé ses fixtures. Session et cache Next sont simulés ; aucune donnée SQL n’est fabriquée par un mock. Cette preuve SQLite ne qualifie ni PostgreSQL, ni navigateur, ni correction future.
