# Périmètre des modèles de facturation récurrente

La [baseline](baseline.json) de `13a89e7` conserve huit assertions : six échecs et deux réussites sans erreur de hook. Le [diagnostic](../../qualification-factures-recurrentes-20261009.md) distingue droit Finance, société du client et rattachement d’agence. Aucun correctif n’est revendiqué.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des clés fictives, copier le [reproducer](reproducer.test.ts.txt) en `tests/unit/recurring-read.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/recurring-read.probe.test.ts
```

Session et cache Next sont simulés ; les actions, permissions et Prisma sont réels. Le probe crée et supprime uniquement ses fixtures et ne génère aucune facture ni aucun envoi. La référence incohérente de client est créée directement par la fixture, sans conclusion sur les mutations de l’application. Le fichier est archivé hors de la découverte des tests ; la CI Contacts ne teste pas la correction de ce diagnostic.
