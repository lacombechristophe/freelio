# Tests et qualification

## Préparer l’environnement

Utiliser Node.js 24 et les dépendances du lockfile. Les suites SQL et navigateur écrivent leurs fixtures : leur `DATABASE_URL` doit désigner une base de recette neuve et isolée. Les clés doivent être fictives, sans connexion fournisseur réelle.

SQLite doit être initialisée depuis `prisma/schema.prisma`. PostgreSQL utilise les migrations de `prisma/postgresql/migrations`. La CI montre la préparation complète dans [ci.yml](../.github/workflows/ci.yml). Les fixtures navigateur sont consommées par les parcours ; une recette complète doit repartir d’une base neuve.

## Contrôles locaux

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

`lint` exécute ESLint et Oxlint. `test:unit` conserve `--no-file-parallelism` : les fichiers SQL partagent leur base. La concurrence explicitement exercée dans un test reste active. Pour cibler une régression :

```sh
npm run test:unit -- tests/unit/stock-reservation-integrity.integration.test.ts
```

Les E2E utilisent le serveur compilé avec `E2E_USE_PRODUCTION_SERVER=true` et leurs comptes fictifs. Ne pas déduire leur réussite d’un build. `npm run verify` prépare aussi la base configurée ; il ne doit jamais viser une base partagée.

## Matrice CI

| Job | Ce qu’il vérifie |
| --- | --- |
| Desktop / SQLite | Types, deux moteurs de lint, suite SQL, couverture ciblée, build, parcours Chromium et audits npm |
| Mobile / SQLite | Même socle avec navigation compacte et parcours mobiles ; exclusions explicites de certaines mutations desktop |
| PostgreSQL | Migrations neuves, même suite SQL, avec un fuseau SQL non UTC |
| Image Linux | Build sans secrets, migrations, Prisma, sondes, arrêt, Redis/worker, PDF Chromium et archive de contrat |

Les deux suites SQLite ne sont pas additionnées. Le seuil de couverture porte sur les six modules déterministes de `vitest.config.mts`, pas sur toute l’application. Les flux UI et transports fictifs ont leurs propres suites. Les durées, exclusions et résultats restent attachés au commit et au rapport de chaque job.

Pour vérifier l’image hors CI : `node scripts/verify-container-runtime.mjs IMAGE`. Ce script crée des conteneurs fictifs dédiés sur un réseau interne et conserve son rapport ; il n’utilise aucun `.env` du projet.

## Qualification hébergée

Après les contrôles de la révision candidate puis de main, promouvoir l’artefact exact et vérifier `X-Freelio-Revision` sur `/api/health/ready`. Contrôler les refus d’écriture, les routes protégées et le profil de fichiers avant la recette authentifiée.

```sh
npx --no-install playwright test --config=playwright.hosted.config.ts
```

Cette recette reçoit `PLAYWRIGHT_BASE_URL`, `HOSTED_DEMO_EMAIL` et `HOSTED_DEMO_PASSWORD` par environnement privé. Elle contrôle les modules, les trois dossiers de référence, les PDF, les refus et la déconnexion, sans publier les identifiants ou traces d’authentification. Ne jamais ajouter de secret au dépôt pour rendre un test autonome.

## Lire les preuves

Le [workflow courant](https://github.com/lacombechristophe/freelio/actions/workflows/ci.yml) et les contrôles de la PR sont la référence pour un nouveau changement. Les [archives](history.md) conservent les recettes précédentes et leurs incidents ; une relance réussie n’efface pas une première tentative échouée.

Une mise à niveau doit être testée depuis la version précédente en plus d’une base vide. Un changement financier exige des cas d’arrondi et de concurrence ; un changement de droits, des contrôles société/agence/rôle et l’absence de fuite dans le payload complet. Un refactoring conserve l’API publique, les frontières serveur/client et les comportements couverts.

La recette automatisée n’établit ni conformité réglementaire, ni délivrabilité réelle, ni charge de production, ni récupération complète de l’hébergeur. Les contrôles d’interface et leurs limites sont détaillés [séparément](interface-quality.md).
