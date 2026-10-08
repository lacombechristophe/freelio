# Lecture du client imbriqué dans une affaire

La [baseline](baseline.json) identifie `a98f275`, les empreintes et les quatorze assertions : onze échecs et trois réussites, sans erreur de hook. Le lecteur retourne des caches financiers et un score global inaccessibles, ainsi que des relations hors agence ou société. Les contrôles positifs Owner, pipeline étranger et suspension passent.

Dans une copie isolée de cette référence, avec dépendances du lockfile, Prisma SQLite généré, une base neuve et des secrets fictifs, copier le [probe](reproducer.test.ts.txt) en `tests/unit/opportunity-read.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/opportunity-read.probe.test.ts
```

Le probe crée et supprime seulement ses fixtures. Il emploie les vraies actions, contrôles et lectures SQL ; session et cache Next sont simulés. Les relations incohérentes sont des fixtures explicites, sans conclusion sur leur création par les mutations actuelles. La sortie brute privée est identifiée par son empreinte ; les résumés publics ne reprennent pas les chemins de la recette.

Le [contrat approuvé](../../contrat-affaire-client-droits.md) décrit le correctif désormais implémenté. La première extension de 22 cas passe, avec 53 régressions Client/synthèses ; une 23e situation vérifie le filtrage avant la limite des dix références. La suite complète et PostgreSQL doivent qualifier cette extension. Huit parcours ordinateur/mobile sont préparés ; leur découverte n’est pas leur exécution. Ces défauts appartiennent à un autre lecteur que les synthèses déjà corrigées et leurs CI encore en cours.

La correction est dans `6578c47`, les fixtures et E2E dans `c88a0c6`. Les [contrôles locaux](local.json) passent types, ESLint/Oxlint, 1 270 tests SQLite dans 172 fichiers et build de 75 pages. Le rejeu JSON des 23 régressions passe sans erreur de hook ; le schéma PostgreSQL est validé sans connexion. La découverte charge 252 E2E dans 47 fichiers, sans navigateur local. Le contrôle de publication inspecte 1 077 fichiers et 3 116 blobs historiques, sans résultat bloquant selon ses motifs.

Les [deux CI de fd9b281](ci-fd9b281.json) passent ensuite 1 270 SQLite, 1 269 PostgreSQL et une exclusion native, les 23 régressions de l’affaire, neuf contrôles Linux et les deux audits à zéro. Elles sont toutefois annulées après 35 minutes : les quatre nouveaux cas ordinateur atteignent chacun leur délai de quatre minutes. Le rapport conserve les lignes émises avant interruption, sans les présenter comme une suite complète : 113 réussites / quatre échecs / une exclusion pour la branche, 118 / quatre / une pour la PR. Les cas mobiles ne sont pas qualifiés.

Les douze captures du détail existent et la page 404 n’a aucune capture. Le diagnostic par le code et ces artefacts identifie le conteneur de capture : le test cherche `#dashboard-main` après remplacement du tableau de bord par la page introuvable globale, qui n’a pas cet élément. `fa65598` cible désormais le défilement du document pour cette page et exige un conteneur visible. Assertions de données, capture complète, débordement et délais restent conservés. Le reporter interrompu n’a pas produit ses piles d’échec finales ; les traces seront aussi conservées lors d’une annulation avec `ff0c895`. La nouvelle CI doit confirmer cette correction.
