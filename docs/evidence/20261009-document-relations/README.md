# Relations des devis, factures et contrats

La [baseline](baseline.json) de `13a89e7` conserve dix-sept assertions : treize échecs et quatre réussites sans erreur de hook. Le [contrat proposé](../../contrat-documents-relations-droits.md) détaille les références à borner et les mentions visibles soumises à accord. Aucun correctif de ce lot n’est encore revendiqué.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des clés fictives, copier le [reproducer](reproducer.test.ts.txt) en `tests/unit/document-relations.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/document-relations.probe.test.ts
```

Les lectures SQL, actions et permissions sont réelles ; session et cache Next sont simulés. Le probe crée et supprime uniquement ses fixtures. Les relations incohérentes testent la lecture de données anciennes et ne démontrent pas leur création par les mutations de l’application. Le probe est archivé hors du répertoire de découverte des tests ; la CI Contacts n’exécute pas ce lot proposé.
