# Régression financière de Suivi client

Sur le candidat `653cddc6c03fd8f3cf73c6fc12e07696181fb545`, le cas Owner réussit ; Technicien et SAV reçoivent chacun le montant de renouvellement et l’encours échu sans `finance.read`, soit quatre assertions de restriction échouées. Les [résultats et empreintes](baseline.json) ne sont pas présentés comme une suite réussie.

Le [reproducer initial](reproducer.test.ts.txt) reste archivé hors suite verte. Le [lot visible](../../contrat-suivi-client-droits.md) a ensuite été approuvé ; la [suite étendue](comparison.json) reproduit 21 échecs sur 26 cas puis 26 réussites après correction. Sa [qualification](../../qualification-suivi-client-droits-20261008.md) distingue ces étapes et les moteurs. Dans une copie isolée de 653cddc avec base neuve, dépendances du lockfile et secrets fictifs :

```sh
cp docs/evidence/20261008-customer-success-permissions/reproducer.test.ts.txt tests/unit/customer-success-permissions.probe.test.ts
npm run test:unit -- tests/unit/customer-success-permissions.probe.test.ts
```

Le retour attendu est non nul. La recette courante a supprimé son fichier temporaire après exécution et nettoyé ses fixtures. Session et cache Next sont simulés ; aucune donnée SQL n’est fabriquée par un mock. Cette preuve SQLite ne qualifie ni PostgreSQL, ni navigateur, ni correction future.

La suite de 26 cas correspond au [fichier conservé dans 46a1fa0](https://github.com/lacombechristophe/freelio/blob/46a1fa0/tests/unit/customer-success-permissions.integration.test.ts). Trois cas ajoutés ensuite reproduisent une collision de nom dans les règles recommandées : deux remplacements financiers interdits échouent, le cas Owner passe. Le [même fichier et les mêmes trois cas](default-collisions.json) passent après correction. La sélection de ces trois cas exclut les 26 autres dans cette seule comparaison ; aucune exclusion n’est ajoutée à la suite complète. Les permissions, la valeur conservée et le compte réellement installé de l’audit sont vérifiés en SQL.

Les [deux CI complètes de 949adca](ci-949adca.json) qualifient ensuite les 29 cas sur SQLite/PostgreSQL et les huit parcours des quatre rôles sur ordinateur/mobile. Les [deux échecs de sélecteur de 81aa846](ci-81aa846.json) restent conservés. La [découverte locale](local-discovery.json) explique les deux cas d’un ancien probe non suivi par Git ; ils ne font pas partie des 194 cas du dépôt.
