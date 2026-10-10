# Régression des droits dans Analyses Service

La référence `8126729ce8b163cf05ee5eba5ca9d0d137538b53` reproduit 20 échecs sur 26 cas SQL réels. Les six cas réussis préservent les tickets Owner, les tickets des trois rôles affectés à une agence et le refus d’un membre suspendu dans le lecteur et l’export. Les [résultats et empreintes](baseline.json) indiquent chaque assertion ; aucune correction ou CI nouvelle n’est qualifiée ici.

L’exécution initiale a aussi chargé les 1 023 tests existants : tous passent. La configuration temporaire fusionnait les inclusions de la configuration du dépôt ; ces réussites sont distinctes des 26 cas de ce [reproducer](reproducer.test.ts.txt). Aucune exclusion n’a été ajoutée à la suite versionnée.

Dans une copie isolée du candidat, avec base SQLite neuve, dépendances du lockfile et secrets fictifs :

```sh
cp docs/evidence/20261008-service-analytics-permissions/reproducer.test.ts.txt tests/unit/service-analytics-permissions.probe.test.ts
npm run test:unit -- tests/unit/service-analytics-permissions.probe.test.ts
```

Le retour attendu est non nul. Le fichier `.txt` n’appartient pas à la suite verte. Session et cache Next sont simulés ; actions, route d’export, contrôles de droits, relations SQL et compression ZIP sont réels. Deux sociétés, deux agences et tous les enfants créés sont fictifs et nettoyés après exécution. Les relations volontairement incohérentes vérifient les frontières de société, même si les mutations applicatives devraient les refuser.

Les trois cas d’export initiaux échouent à la première assertion sur la moyenne ; ils ne prouvent donc pas l’évaluation des assertions suivantes sur les diagnostics et cohortes du ZIP. Le [contrat](../../contrat-analyses-service-droits.md) a ensuite été approuvé. La suite active étendue passe 40 cas SQLite, dont des vérifications indépendantes de chaque CSV, les lectures Owner/Admin et les réponses sans ticket. La [preuve locale commune](local.json) et la [qualification](../../qualification-catalogue-sites-service-20261008.md) distinguent ces étapes. PostgreSQL et navigateur restent à qualifier sur le candidat.
