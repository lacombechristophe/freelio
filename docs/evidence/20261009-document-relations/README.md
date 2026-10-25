# Relations des devis, factures et contrats

La [baseline](baseline.json) de `13a89e7` conserve dix-sept assertions : treize échecs et quatre réussites sans erreur de hook. Le [rejeu sur 0687a6f](baseline-current.json) confirme ces résultats. Le [contrat approuvé](../../contrat-documents-relations-droits.md) détaille les références et les mentions visibles.

Dans une copie isolée de cette référence, avec les dépendances du lockfile, Prisma SQLite généré, une base neuve et des clés fictives, copier le [reproducer](reproducer.test.ts.txt) en `tests/unit/document-relations.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/document-relations.probe.test.ts
```

Les lectures SQL, actions et permissions sont réelles ; session et cache Next sont simulés. Le probe crée et supprime uniquement ses fixtures. Les relations incohérentes testent la lecture de données anciennes et ne démontrent pas leur création par les mutations de l’application. Le probe reste archivé hors du répertoire de découverte des tests.

## Correction et qualification

`ae88e47` borne les relations par société, client et agences, avec la politique des contrats commerciaux conservée. Les identifiants inaccessibles sont retirés de la réponse ; des indicateurs distinguent une référence absente d’une référence masquée. La facturation des commandes n’est pas lue sans Finance. Les commandes de création refusent aussi une référence incohérente lors d’un appel direct.

Les [preuves locales](local.json) passent 33 cas SQL, 1 410 tests dans 176 fichiers, types, deux lints et build de 75 pages. Les [deux CI](ci-ae88e47.json) passent chacune 1 409 PostgreSQL avec une exclusion native SQLite, 1 410 SQLite dans les deux suites, 269 E2E avec 19 exclusions historiques, neuf contrôles Linux et audits à zéro. Les 33 régressions Documents et les six parcours ordinateur/mobile Owner, Sales et Accounting passent. La fusion de test et le candidat possèdent les mêmes 934 entrées hors documentation.

Les archives et signatures ne sont pas réécrites. Ce lot ne qualifie pas toutes les écritures financières ni les nouvelles migrations des récurrences.
