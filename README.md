# Freelio

[![CI](https://github.com/lacombechristophe/freelio/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/lacombechristophe/freelio/actions/workflows/ci.yml)

CRM/ERP de démonstration pour une entreprise d’installation et de services : clients, devis, facturation, chantiers, stocks et SAV. Le projet présente un développement métier complet, avec isolation des sociétés et agences, droits par domaine, transactions SQL et documents archivés.

**[Ouvrir la démonstration](https://freelio-eight.vercel.app)** · [Architecture](docs/architecture-domain-boundaries.md) · [Tests](docs/testing.md) · [Documentation](docs/README.md)

La démo hébergée utilise des données fictives et fonctionne en lecture seule. Les identifiants du compte fictif se transmettent séparément. Les intégrations mail/OAuth et le stockage persistant sont désactivés dans ce profil.

## Parcours de référence

- Vente : client → devis versionné → facture → archive → règlement fictif.
- Service : équipement → ticket SAV → planification → intervention → rapport.
- Reprise : import fictif → simulation → rapprochement → export → récupération.

Les [capacités et limites](docs/coverage-and-external-dependencies.md) distinguent le code disponible, la démonstration et les validations nécessaires avant un usage réel.

## Stack

| Couche | Choix |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript strict |
| Données | Prisma 7 ; PostgreSQL en environnement partagé, SQLite en démo locale |
| Accès | Auth.js, mots de passe, MFA, memberships et permissions par domaine |
| Documents | Puppeteer/Chromium, pdf-lib, archives chiffrées et empreintes |
| Traitements | Worker Node.js, BullMQ/Redis TCP ; Upstash REST pour le limiteur distribué |
| Vérification | Vitest, intégrations SQL, Playwright, GitHub Actions |

Le monolithe conserve les règles métier dans `src/lib`, les cas d’usage dans `src/actions` et les écrans dans `src/app`. Le worker dispose de son propre processus. Les [décisions techniques](docs/decisions-techniques.md) expliquent les compromis.

## Démarrage

Prérequis : **Node.js 24.x** et npm. Définir une `DATABASE_URL` locale, par exemple `file:./dev.db`, pour la génération Prisma à l’installation. Les commandes suivantes installent les dépendances puis préparent une démo isolée à partir de données fictives :

```sh
npm ci
npm run demo
```

Si les scripts d’installation sont désactivés, préparer explicitement le binaire `better-sqlite3` avant d’utiliser SQLite. Le lanceur ne procède à aucune installation.

`npm run demo` crée une copie temporaire, sa base et un compte fictif. Il affiche le chemin privé des identifiants ; il ne copie ni `.env` ni données du dépôt. Le [guide local](docs/demo-local.md) décrit les modes préparation, reprise, sauvegarde et restauration.

Pour développer sur PostgreSQL, suivre le [guide de contribution](CONTRIBUTING.md#développement-avec-postgresql). Le Compose fournit uniquement PostgreSQL et Redis sur l’interface locale.

## Vérifications et preuves

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Les tests SQL et navigateur exigent une **base isolée** ; ils créent et suppriment leurs propres fixtures. `npm run verify` prépare la base configurée avant les contrôles. Le [guide de test](docs/testing.md) précise les profils, les prérequis et les limites de couverture.

La CI exécute SQLite avec les parcours desktop/mobile, PostgreSQL et le runtime Linux avec Chromium. Chaque résultat appartient au commit testé. L’en-tête `X-Freelio-Revision` de `/api/health/ready` identifie le code servi ; un build réussi ne suffit pas à qualifier un déploiement.

## Exploitation et maintenance

Le [runbook](docs/production-runbook.md) couvre les processus, migrations, sauvegardes et incidents. Une exploitation modifiable nécessite une infrastructure et des comptes fournisseur qualifiés. La démo actuelle n’offre ni SLA, ni certification Factur-X ou WCAG, ni engagement de récupération hébergée.

Les [archives de qualification](docs/history.md) conservent les anciennes décisions, incidents et recettes à leurs révisions d’origine. Elles sont séparées des guides courants pour éviter de présenter un ancien résultat comme une validation actuelle.

Ne publier aucun `.env`, identifiant, cookie, fichier métier ou sauvegarde. Le code propre reste sans licence de redistribution, selon le choix du propriétaire. Les [notices des dépendances](docs/dependances-et-licences.md) restent distinctes.
