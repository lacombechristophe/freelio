# Outillage de test : correctifs Vite et Vitest

Code qualifié : `4a7a24157cc7281179c605f1019a848d67539346`. Le code applicatif reste celui de `e325c30`, dont le [dossier chantier](../20261021-project-workspace/README.md). Seuls `package.json` et `package-lock.json` changent.

Le nouvel audit du 21 octobre trouve une dépendance Vite de gravité haute, regroupant six avis, dans [l’état initial](before-vite-complete.json) ; [l’audit production initial](before-vite-production.json) est à zéro. Vite passe de 8.3.0 à 8.3.3, version corrigée des avis examinés, avec un override explicite pour la dépendance transitive de Vitest. Les avis concernent l’outillage de développement ; leur présence ne prouve pas l’exploitation de l’application déployée. [Avis Vite](https://github.com/advisories/GHSA-587h-7wmj-h5pm), [correctif Windows](https://github.com/advisories/GHSA-698v-4r3x-3vcv), [release 8.3.3](https://github.com/vitejs/vite/releases/tag/v8.3.3).

Un [audit intermédiaire](after-vite-complete.json), après Vite, signale aussi deux avis du mocker Vitest mis à jour le 21 octobre : trois dépendances de gravité modérée sont comptées par npm, pas trois vulnérabilités indépendantes. Vitest et son module de couverture passent ensemble de 4.1.11 à 4.1.12, sans migration vers la version majeure suivante. Les composants `@vitest/*` restent alignés. [Injection dans les mocks](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [traversée Windows](https://github.com/advisories/GHSA-xp26-3454-mjgp), [backport 4.1.12](https://github.com/vitest-dev/vitest/releases/tag/v4.1.12).

Le diff final porte sur **27 paquets de développement et les métadonnées de la racine** : Vite, Rolldown et ses liaisons, types Oxc et neuf composants Vitest. Aucun paquet de production, script applicatif, schéma ou seuil d’audit ne change. Les résolutions inutiles de Chai, std-env et tinyrainbow obtenues lors de la préparation sont écartées ; leurs versions antérieures satisfont toujours les contraintes et le lockfile est revérifié par npm.

## Qualification locale

Le propriétaire a autorisé l’installation uniquement dans la copie isolée de recette. Les installations utilisent `--ignore-scripts --no-audit --no-fund`, le registre npm public explicite et une configuration utilisateur vide. Aucun paquet global ni dépendance du dossier principal n’est installé. Le build conserve sa génération Prisma explicite ; la copie possédait déjà ses dépendances et son client généré.

Les [résultats et empreintes](local.json) relient le commit, les fichiers source, les versions présentes et les rapports. Les **1 215 fichiers source** correspondent au commit ; les **710 paquets présents** comparés au lockfile n’ont pas d’écart de version, après normalisation documentée du préfixe `v` dans deux métadonnées Upstash. Les paquets optionnels d’autres plateformes absents ne sont pas comptés. Il s’agit d’un contrôle de versions, pas d’un examen du contenu de chaque paquet.

La suite complète passe **3 481 tests dans 276 fichiers**, sans échec ni exclusion, avec couverture et SQLite fictive neuve. Son manifeste correspond exactement aux fichiers unitaires du commit. Les 173 cas ciblés passent séparément ; les sept contrôles PDF/générateur passent dans la suite complète. Types, génération des routes, ESLint, Oxlint et build de 76 pages passent. La couverture concerne les six modules configurés, pas toute l’application. Les 470 cas Playwright sont sélectionnés, **pas exécutés**.

Les audits [production](production.json) et [complet](complete.json) sont à zéro avec le lockfile final et l’installation corrigée. La [synthèse d’inventaire](dependencies.json) couvre 864 entrées, aucune licence inconnue et 40 métadonnées à examiner ; elle ne constitue pas une analyse juridique. Le rapport intégral reste dans la recette avec son empreinte ; versions, sources et intégrités sont déjà dans le lockfile, et le script d’inventaire permet de le régénérer. Les audits conservés décrivent la base d’avis consultée à cet instant et ne garantissent pas l’absence d’avis futurs.

## Reproduction et limites

Dans une copie isolée autorisée, installer avec `npm ci --ignore-scripts --no-audit --no-fund`, configurer uniquement des secrets fictifs et une `DATABASE_URL` SQLite neuve, puis générer le client par `node scripts/sync-prisma-schemas.mjs` et préparer la base par `node scripts/prepare-dev-database.mjs`. Exécuter `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism`. Le build utilise `npm run build` ; types et lints suivent les scripts du projet. Ne pas lancer le build en parallèle de la suite complète.

Les audits se reproduisent par `npm audit --omit=dev --json` et `npm audit --json`, avec le registre public et une configuration npm vide. L’identité du code et la date de consultation doivent accompagner leurs résultats. Pour la sélection navigateur sans application : `node node_modules/@playwright/test/cli.js test --list --reporter=json`.

Cette qualification Windows ne remplace pas PostgreSQL, Linux, les interactions navigateur, les comptes fournisseurs ou la recette hébergée du même SHA. Le dépôt est privé ; le plafond GitHub Actions à 0 € et l’arrêt de l’usage payant restent à attester avant push déclenchant une CI. Aucune nouvelle CI, fusion, publication ou modification financière n’a été effectuée.
