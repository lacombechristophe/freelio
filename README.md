# Freelio — application métier full stack

Freelio est un CRM/ERP de démonstration pour une entreprise d’installation et de services : relation client, devis, facturation, projets, stocks et interventions. Le projet sert de cas d’étude pour présenter une démarche de développement freelance : conception métier, isolation des entreprises, transactions, documents, tests et exploitation.

Le périmètre courant utilise des données fictives. Le projet ne revendique pas une certification Factur-X, une conformité réglementaire globale, un SLA ni une validation exhaustive. Les capacités et limites sont décrites dans la [matrice de couverture](docs/coverage-and-external-dependencies.md).

## Parcours de référence

1. Client → devis versionné → facture et archive → règlement fictif.
2. Équipement → ticket SAV → planification → intervention → justificatif et rapport.
3. Import fictif → simulation → reprise → rapprochement → export et récupération.

Chaque parcours doit être relié à des tests, à une version et à ses limites. Un compteur de tests seul ne garantit pas la couverture métier.

## Stack et frontières

| Élément | Choix actuel |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript strict |
| Données | Prisma 6 ; PostgreSQL pour l’environnement partagé, SQLite pour la démo locale |
| Accès | Auth.js, mots de passe, MFA, memberships et droits par domaine |
| Documents | Puppeteer/Chromium, pdf-lib et XML Factur-X ; aucune certification globale |
| Travaux de fond | BullMQ/Redis TCP ; Upstash REST pour la limitation distribuée |
| Fichiers | Local en développement ; R2 privé pour le runtime de production actuel |
| Vérification | Vitest, intégrations SQL, Playwright et GitHub Actions |

L’architecture est un monolithe modulaire avec un processus worker séparé. Les règles financières ne dépendent pas du rendu des écrans. Les clients sont partagés au niveau entreprise ; les dossiers opérationnels peuvent être bornés aux agences. Voir les [frontières métier](docs/architecture-domain-boundaries.md).

## Démo locale isolée

Prérequis : Node **24.x**, npm et les dépendances installées. Le postinstall d’une installation neuve génère Prisma et nécessite une DATABASE_URL de développement. Pour installer sans ce postinstall : `npm ci --ignore-scripts`, puis générer explicitement le client SQLite avant la première démo.

Avec un client Prisma SQLite déjà généré :

```powershell
npm run demo
```

Le lanceur crée une nouvelle copie dans le répertoire temporaire, une SQLite neuve et un compte fictif avec mot de passe. Il ne copie aucun .env ni donnée métier du dépôt. Le terminal affiche l’adresse locale et le chemin privé des identifiants, sans afficher les secrets. Il réutilise les dépendances installées sans régénérer leur client Prisma.

La démo locale est distincte de la future démo publique. Son garde-fou Node refuse les connexions fournisseur mais permet les téléchargements publics de polices. Voir le [guide de démarrage, reprise, sauvegarde et restauration](docs/demo-local.md).

## Développement avec PostgreSQL

Docker Compose prépare uniquement PostgreSQL et Redis de développement, exposés sur l’interface locale :

```powershell
docker compose up -d --wait
$env:DATABASE_URL = "postgresql://freelio_dev:local-only-freelio-development@127.0.0.1:55432/freelio_dev?schema=public"
$env:REDIS_URL = "redis://127.0.0.1:56379/0"
npm ci
npm run db:deploy:postgres
npm run dev
```

Les identifiants de Compose sont publics et réservés à ces services locaux. Le développement normal charge aussi les variables locales ; configurer des secrets propres au développement à partir de [.env.example](.env.example). Ne pas copier une base existante pour créer les fixtures.

Utiliser les migrations versionnées pour PostgreSQL ; aucun db push sur une base partagée. Les volumes persistent après `docker compose down` ; l’option -v les détruirait et n’est pas une commande de reprise.

## Vérifications et preuves

```powershell
npm run typecheck
npm run lint
npm run test:unit
npm run build
npm run test:e2e
```

Les tests d’intégration et fixtures écrivent et suppriment des données : utiliser exclusivement une base isolée. `npm run verify` prépare la base configurée avant les contrôles ; il n’est pas destiné à un environnement partagé. Les E2E nécessitent leur propre jeu de données ; leur réussite ne se déduit pas d’un build.

- Recette du 30 septembre 2026 : 427 tests dans 100 fichiers, build/typage/lint réussis ; 14 pages et 13 contrôles navigateur ciblés ; sauvegarde/restauration SQLite. Voir le [compte rendu](docs/technical-hardening-20260930.md).
- La CI définit des jobs SQLite et PostgreSQL. Un workflow existant ne prouve pas son exécution distante : contrôler le résultat du commit exact avant publication.
- Les validations PostgreSQL, Linux/Docker et exploitation sont consignées dans le [suivi CTO](docs/execution-cto-20261001.md).
- La livraison locale `review-local-20261002-final` conserve les [rapports](docs/evidence/20261002/README.md) : 457 tests SQLite, 456 tests PostgreSQL, 19 parcours desktop, les contrôles de démo en lecture seule, les seuils de couverture ciblée et une charge locale de 30 minutes sans erreur. Leurs dates, conditions et limites sont explicites ; aucun résultat CI distant n’est revendiqué.

## Image et exploitation

```powershell
docker build -t freelio:local-review .
node scripts/verify-container-runtime.mjs freelio:local-review
```

Le Dockerfile prépare le client PostgreSQL et le build sans migrer une base réelle. Il inclut Chromium, utilise un utilisateur non root et tini. Secrets et données locales sont exclus du contexte de build. Les variables NEXT_PUBLIC sont définies au build ; les secrets serveur se fournissent au runtime.

La recette crée uniquement des conteneurs fictifs nommés de manière unique, sur un réseau Docker interne, puis les retire. Elle vérifie le refus d’une configuration vide, les migrations sur PostgreSQL neuf, Prisma Linux, un job BullMQ/Redis produisant un PDF, l’arrêt du worker et un PDF Chromium hors réseau. Elle conserve un rapport dans un nouveau dossier temporaire. Elle ne charge aucun .env du projet. L’image utilise OpenSSL 3 aussi lors de la génération Prisma.

La génération PDF actuelle désactive la sandbox Chrome : non-root et conteneur ne suffisent pas à attester une isolation complète. Vérifier les restrictions du rendu, les ressources, le réseau et les processus dans le runtime cible.

Web : `npm start`. Worker : `npm run worker`. Migrations : étape de release dédiée, jamais simultanément dans chaque replica. Le runtime de production actuel exige PostgreSQL, les secrets dédiés, R2 et le limiteur distribué ; construire une image ne remplace pas cette configuration. Voir le [runbook](docs/production-runbook.md).

## Documentation et collaboration

- [Plan de préparation à la revue CTO](docs/plan-vitrine-cto-20260930.md)
- [Audit et plan de complétude fonctionnelle — 2 octobre 2026](docs/plan-completude-fonctionnelle-20261002.md)
- [État d’exécution et preuves](docs/execution-cto-20261001.md)
- [Architecture métier](docs/architecture-domain-boundaries.md)
- [Décisions techniques et limites](docs/decisions-techniques.md)
- [Dépendances et licences](docs/dependances-et-licences.md)
- [Carte des risques et tests](docs/carte-des-preuves.md)
- [Guide de revue CTO](docs/revue-cto.md)
- [Guide de contribution](CONTRIBUTING.md)
- [Couverture et limites](docs/coverage-and-external-dependencies.md)
- [Exploitation et récupération](docs/production-runbook.md)
- [Démo locale](docs/demo-local.md)

Les rapports d’audit et de déploiement sont historiques et datés. Les changements se présentent par lots cohérents, avec leur validation et leur périmètre. Aucun ancien lien de déploiement n’est présenté ici comme une démo courante vérifiée.

Ne jamais publier les .env, bases, identifiants de démo, pièces ou sauvegardes. Décider la licence de distribution du code propre avant partage public et inventorier les licences des dépendances/assets.
