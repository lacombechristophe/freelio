# Périmètre des modèles de facturation récurrente

La [baseline](baseline.json) de `13a89e7` conserve huit assertions : six échecs et deux réussites sans erreur de hook. Le [rejeu sur ae88e47](baseline-current.json) confirme ces résultats. Le [diagnostic et la correction](../../qualification-factures-recurrentes-20261009.md) distinguent droit Finance, société du client et rattachement d’agence.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des clés fictives, copier le [reproducer](reproducer.test.ts.txt) en `tests/unit/recurring-read.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/recurring-read.probe.test.ts
```

Session et cache Next sont simulés ; les actions, permissions et Prisma sont réels. Le probe crée et supprime uniquement ses fixtures et ne génère aucune facture ni aucun envoi. La référence incohérente de client est créée directement par la fixture, sans conclusion sur les mutations de l’application. Le fichier est archivé hors de la découverte des tests.

## Correction locale sur 565986e

Les lectures exigent Finance ; création, activation et suppression exigent Finance d’écriture. Le modèle possède un chantier relationnel, ou le périmètre du site de l’entretien. Si les deux existent, les deux doivent être cohérents et accessibles. Les modèles sans ces rattachements sont réservés à Owner/Admin.

Les listes, recherches et compteurs utilisent les mêmes prédicats SQL avant pagination. Le JSON historique doit correspondre au chantier relationnel : une référence invalide conservée dans le JSON ne devient pas un modèle global sans chantier. La migration PostgreSQL et la procédure SQLite reprennent uniquement les anciennes références cohérentes ; elles ne réactivent aucun modèle. Le worker vérifie aussi les références d’entretien avant création du brouillon.

Les [preuves locales](local.json) passent 26 régressions du lecteur, 13 du worker et 33 Documents, soit 72 contrôles ciblés ; 1 436 tests dans 177 fichiers, types/lints et build de 75 pages. Le test de migration rejoue deux fois l’UPDATE versionné sur les références valides, étrangères, absentes et incohérentes. Les volumes de 530 modèles, clients et chantiers vérifient recherche, pages, total et choix conservé. La base SQLite existante a aussi reçu la relation et le backfill sans suppression.

Les [deux CI de 0f45087](ci-0f45087.json) passent les 26 cas de périmètre, 13 cas worker et 33 cas Documents sur PostgreSQL réel, puis les huit E2E Récurrences pour Owner, Accounting, Viewer et Sales sur ordinateur/mobile. Chacune passe 1 435 PostgreSQL et une exclusion native SQLite, 1 436 SQLite dans les deux suites, 277 E2E et 19 exclusions historiques, neuf contrôles Linux et les audits à zéro. Types, lints, build et couverture réussissent. Les 941 entrées Git hors documentation sont identiques entre le candidat et la fusion de test PR. Ces preuves qualifient leur référence ; elles ne sont pas attribuées à la CI Documents antérieure.
