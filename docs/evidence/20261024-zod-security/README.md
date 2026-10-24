# Qualification des dépendances et du planning

Le [premier passage de la CI publique](ci-public-f3d8464.json) conserve un résultat distinct : runtime et suite PostgreSQL réussis, 255 tests desktop et 237 mobile réussis, mais onze échecs d’interface et dix-neuf exclusions sur les deux surfaces. Les correctifs `adf76c6` / `cad3c4d` passent ensuite 146 tests ciblés, types, lint et build ; leur matrice complète est consultable dans les [contrôles de la PR #8](https://github.com/lacombechristophe/freelio/pull/8/checks). Les résultats précédents ci-dessous restent attachés au code `77c40cf`.

Le candidat `77c40cf4a0015bd5e4884f79bfe621e6740ccda5` comprend la mise à jour Zod 4.6.6 / Puppeteer 25.13.0 de `10920b4` et une lecture du planning par lots de références. Les suites complètes passent sur SQLite et PostgreSQL 18.3, avec les mêmes fichiers de source. Le [reçu](local.json) conserve les résultats, les empreintes et les échecs intermédiaires. La [qualification native précédente](../20261023-native-postgres/README.md) reste attachée à son ancien lockfile.

## Motif et correction

L’audit npm du 24 octobre relève quatre entrées affectées par le même [avis Zod GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), mis à jour le 23 octobre. Le [correctif officiel](https://github.com/colinhacks/zod/commit/a0ebf97) vérifie les bornes supérieures des collections avant de parcourir leurs éléments. Il ne crée pas de limite pour un schéma qui n’en déclare pas.

La chaîne Puppeteer utilisait également Zod 3.25.76 via chromium-bidi. La version 25.13.0 de Puppeteer utilise une version de chromium-bidi compatible avec Zod 4, permettant de retirer cette ancienne copie sans forcer un changement majeur par override. Neuf paquets de cette chaîne changent de version ; une ancienne copie est supprimée. Cinq mises à jour sans rapport, proposées lors de la résolution initiale, sont écartées ; l’arbre final passe `npm ls --package-lock-only --all`. Les champs de licence des neuf versions mises à jour restent identiques ; cette comparaison ne remplace pas l’examen des notices de redistribution.

Une vérification bornée soumet 1 000 chaînes à `z.array(z.number()).max(2)`. Zod 4.3.6 produit 1 001 erreurs ; Zod 4.6.6 refuse avec une seule erreur de taille. Ce contrôle de bibliothèque ne lance aucun endpoint et ne constitue pas une démonstration d’exploitation de l’application. Les limites d’entrée métier et de transport restent nécessaires.

## Vérifications

L’installation est autorisée et réalisée uniquement dans une nouvelle copie temporaire, avec `--ignore-scripts`, `PUPPETEER_SKIP_DOWNLOAD=true`, sans paquet global ni téléchargement de navigateur. Le lockfile reste inchangé pendant l’installation. Les 709 versions présentes correspondent à ce fichier ; les préfixes `v` de deux versions Upstash sont comparés selon leur forme SemVer canonique. Aucun environnement ni donnée métier du dépôt n’est copié.

Les audits production et complet terminent avec zéro vulnérabilité signalée. Types, ESLint et Oxlint passent. Les 43 contrôles PDF de cinq fichiers passent sans exclusion, avec le Chromium 152.0.7977.42 déjà installé : génération réelle, ressources distantes refusées, arrêt lors d’une annulation et bons de livraison avec polices embarquées. Les ressources externes du document sont refusées et JavaScript est désactivé dans le document.

La suite SQLite complète passe **4 057 tests**, sans échec ni exclusion. PostgreSQL passe **4 056 tests avec une exclusion propre à la restauration SQLite**, dans les mêmes 304 fichiers. Sa base vide reçoit les 73 migrations par Prisma 6.12 ; le catalogue contient 143 tables métier et 1 775 colonnes, avec une session Europe/Paris. Le cluster local de recette est arrêté et ses données conservées après contrôle. Les 43 cas PDF sont aussi présents et réussis dans la suite SQLite finale ; ils ne sont pas comptés comme une exécution supplémentaire.

Types et lint des trois fichiers du correctif final passent ; l’ensemble du dépôt avait passé ESLint/Oxlint sur `10920b4`, les autres sources étant inchangées. Le build propre Next.js 16.4.2 génère 76 pages statiques. Les copies SQLite et PostgreSQL contiennent les mêmes **1 231 fichiers** de code, tests et configuration que `77c40cf`, sans écart d’octets. Une erreur de libellé du lanceur nomme le garde réseau public dans le reçu du build : le code du lanceur, antérieur à cette exécution, sélectionne et charge bien `demo-network.cjs`, qui autorise les GET de polices publics nécessaires. Le reçu original est conservé et cette correction de métadonnée est explicitée dans `local.json`.

## Lecture du planning

La première suite PostgreSQL avec les nouvelles dépendances conserve deux échecs : dix lectures successives de pagination dépassent l’échéance du test, et la transaction du planning de 10 001 créneaux expire. Le profil révèle que les jointures de validation des parents portent sur les candidats avant le tri et la limite. Forcer un plan générique ne résout pas le problème ; cette hypothèse est écartée. Une première découpe en identifiants puis graphe complet reste trop coûteuse et son échec est conservé.

`77c40cf` lit au plus 250 candidats ordonnés par date et identifiant, puis vérifie leurs références avec les prédicats de périmètre déjà utilisés. Le curseur avance aussi lorsque tout un lot est exclu. Les références facultatives, les tickets sans site et le périmètre des rôles restent couverts ; quatre cas supplémentaires comparent le résultat à un oracle SQL indépendant et vérifient la progression au-delà d’un lot entièrement invalide. Les 105 tests ciblés passent, puis les deux suites complètes ci-dessus.

Le test de pagination dispose de trente secondes pour ses dix lectures et leur préparation ; **le délai transactionnel du produit reste de cinq secondes**. La lecture des 10 001 créneaux prend 1 342 ms dans la recette ciblée, puis 1 009 ms dans la suite PostgreSQL complète, avec une réponse de 2 663 octets. Ce sont des observations locales isolées, sans promesse de latence ou de charge. Aucune option PostgreSQL, migration ou règle d’accès n’est modifiée pour obtenir ces résultats.

## Restauration PostgreSQL native

Une recette complémentaire restaure un dump natif du schéma de ce candidat dans une seconde base neuve. La source part de `template0`, reçoit les 73 migrations par Prisma et un [corpus SQL fictif](native-restore-fixture.sql) : deux sociétés, deux clients, deux factures brouillons et deux lignes, avec montants entiers, quantité fractionnaire, JSON Unicode et dates d’hiver/été. Les 144 tables, journal inclus, sont comparées ; cinq contiennent des lignes. Le [reçu de restauration](native-restore.json) conserve empreintes et codes de retour.

`pg_dump` produit une archive custom sans propriétaires ni privilèges ; `pg_restore --exit-on-error --single-transaction` la restaure sans erreur. Comptages et empreintes du JSON ordonné des lignes sont identiques pour chaque table. Les dumps de schéma correspondent aussi, index, contraintes et valeurs par défaut inclus, après retrait des seuls jetons psql aléatoires de restriction et normalisation des fins de ligne. Les factures conservent 350 € HT, 70 € de TVA et 420 € TTC. Une ligne visant une facture absente est refusée avec SQLSTATE `23503` ; la transaction refusée ne change aucune empreinte.

Les deux bases et les fichiers sont conservés dans l’environnement fictif local ; le cluster est arrêté après vérification de son identité. Le premier lanceur est resté en attente de sa capture de sortie après démarrage du serveur, avant toute création de base. L’arrêt du seul cluster identifié a libéré le lanceur ; la recette suivante utilise des descripteurs de journaux directs. Ce premier résultat reste conservé, sans lui attribuer un test de restauration.

Les commandes natives de la recette sont les suivantes, après création de deux bases locales vides et migration/préparation du corpus synthétique dans la source. Fournir les paramètres de connexion locaux hors historique de commande et ne jamais viser la démo hébergée :

```sh
pg_dump --dbname="$SOURCE_DB" --format=custom --no-owner --no-privileges --file=synthetic.dump
pg_restore --dbname="$TARGET_DB" --exit-on-error --single-transaction --no-owner --no-privileges synthetic.dump
pg_dump --dbname="$SOURCE_DB" --schema-only --no-owner --no-privileges --no-comments --no-security-labels --file=source-schema.sql
pg_dump --dbname="$TARGET_DB" --schema-only --no-owner --no-privileges --no-comments --no-security-labels --file=target-schema.sql
```

La comparaison des données utilise, pour chaque table, `count(*)` et `md5(string_agg(row_to_json(t)::text, E'\n' ORDER BY row_to_json(t)::text))`, avec chaîne vide pour une table vide, puis une empreinte SHA-256 de l’ensemble. Elle vérifie l’égalité de ce corpus, sans peupler tous les modèles. L’observation de 1 439 ms concerne seulement la commande locale `pg_restore`, pas un RTO. Aucun serveur applicatif restauré, objet R2, rôle, privilège, PITR ou plan de reprise de l’hébergeur n’est qualifié par cette recette. La restauration SQLite avec pièces reste une preuve distincte de la suite complète. Références des outils consultées le 24 octobre : [pg_dump 18](https://www.postgresql.org/docs/18/app-pgdump.html) et [pg_restore 18](https://www.postgresql.org/docs/18/app-pgrestore.html).

## Image Linux

La recette Docker de `d35675b`, qui contient le même code applicatif `77c40cf`, réussit ses **neuf contrôles**. L’image est construite depuis 826 fichiers suivis, copiés dans un dossier temporaire sans environnement ni données existantes. Le [reçu Linux](linux.json) lie les empreintes du contexte, du Dockerfile, des journaux et de l’image à ce commit. Le build propre génère 76 pages ; le lockfile reste identique et les 369 versions de paquets présents après retrait des dépendances de développement correspondent à ce lockfile.

Le runtime utilise Node 24.22.0, Chromium 156.0.8078.47, OpenSSL 3.5.8, Prisma 6.12, Puppeteer 25.13.0 et Zod 4.6.6, sous l’utilisateur `node` (UID 1000). La recette vérifie :

- le refus d’une configuration de production vide avant écoute ;
- les 73 migrations sur PostgreSQL Linux 18.6 neuf et la création du corpus fictif ;
- les sondes de vie/disponibilité du serveur, puis son arrêt SIGTERM sans kill forcé ;
- un PDF de devis produit par le worker BullMQ connecté à Redis, puis l’arrêt propre du worker ;
- une archive PDF privée de contrat à partir d’une signature synthétique, conservée identiquement au rejeu ;
- un PDF Chromium sans accès réseau, exécuté sans privilèges root.

La recette utilise un réseau Docker interne sans port publié. Ses conteneurs, son réseau et ses deux fichiers temporaires d’environnement sont retirés ; les huit conteneurs préexistants restent en place. L’image et les journaux sont conservés. Les versions des paquets Debian/Chromium sont celles observées lors du build, sans prétendre qu’un futur téléchargement APT les reproduira à l’identique.

Pour reproduire dans une copie isolée : `docker build -t freelio:local-review .`, puis `node scripts/verify-container-runtime.mjs freelio:local-review`. Le premier préflight de copie a refusé par erreur le chemin source `src/app/dashboard/data/page.tsx` ; la vérification a été restreinte au dossier racine privé `data/` avant tout build. Aucun code produit n’est modifié pour cette reprise.

Ces neuf contrôles ne sont ni une nouvelle exécution de la suite unitaire complète sous Linux, ni une recette navigateur authentifiée. R2/Upstash réels, le runtime PDF propre à Vercel, TLS/reverse proxy, la reprise d’un job interrompu et la charge restent distincts. La réussite locale ne transforme pas un run GitHub refusé avant démarrage en CI réussie.

## Suite applicative Linux/PostgreSQL

Une recette distincte complète le contrôle du runtime : la suite entière passe sous Linux avec PostgreSQL 18.6 en fuseau Europe/Paris, **4 056 réussites, aucun échec et une exclusion réservée à SQLite, dans 304 fichiers**. Le [reçu](linux-postgres.json) conserve les empreintes du rapport, des sorties et des 424 fichiers de tests/outillage ajoutés à l’image de recette. La référence est `a77295d`, dont les entrées applicatives sont inchangées depuis l’image de `d35675b` ; le code applicatif testé reste `77c40cf`.

Cette image de test réutilise le runtime Linux et les dépendances de développement verrouillées déjà en cache. Elle est distincte de l’image de livraison. Les 710 versions de paquets présents correspondent au lockfile ; Prisma utilise son moteur Debian/OpenSSL 3. Les 73 migrations sont appliquées sur une base neuve, puis la suite est lancée avec `--no-file-parallelism`, sans modification des tests ni de leurs délais. Le garde réseau Node et le réseau Docker interne excluent les fournisseurs réels ; aucun serveur web n’est lancé.

Les 43 cas des cinq fichiers PDF de référence sont inclus et réussis, sans exclusion. La lecture des 10 001 créneaux prend 1 309 ms avec une réponse de 2 663 octets ; cette observation locale ne constitue pas une mesure de charge. L’unique exclusion concerne la restauration native SQLite, déjà exécutée dans la suite SQLite Windows.

Les conteneurs et le réseau de cette recette sont retirés après copie du rapport ; ses fichiers temporaires d’environnement sont supprimés et les huit conteneurs préexistants restent en place. Les images et les journaux sont conservés. Cette exécution locale ne qualifie pas une CI GitHub hébergée, les parcours navigateur authentifiés ou la suite SQLite sur Linux.

## Démonstration hébergée

La [preview dédiée](https://freelio-demo-77c40cf.vercel.app) pointe vers un déploiement de `7cf0978`, qui contient ce code et sa documentation. Après correction des trois URL canoniques de la branche Preview et reconstruction de cette même version, les sondes anonymes `/api/health/live` et `/api/health/ready` répondent HTTP 200 ; base, schéma et configuration sont OK. Le [reçu hébergé](hosted-7cf0978.json) lie ces réponses au déploiement exact. Les trois URL sont vérifiées dans la configuration de branche ; un parcours de connexion n’est pas déduit de cette vérification.

L’exception de protection Vercel concerne cet alias dédié, rattaché manuellement à la version qualifiée. Les quatre URL de contrôle, dont la branche et le déploiement brut, redirigent toujours vers Vercel SSO. Les premiers essais au niveau du déploiement ont été annulés : le premier n’a pas conservé ses réponses HTTP ; le second confirme HTTP 200 après propagation mais échoue au contrôle d’isolation. Leurs reçus et ces limites sont conservés. L’exception finale est portée par l’alias, sans lien secret de partage, invitation, abonnement ou désactivation globale de protection. Les exceptions sont [disponibles sur tous les plans Vercel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions).

Les cinq réglages de démonstration sont vérifiés sur la branche : lecture seule côté serveur et client, données fictives et deux pilotes de stockage désactivés. Aucun nom de secret fournisseur interdit n’est présent dans ce périmètre ; aucune valeur de secret fournisseur n’est lue. Les paramètres de production et la visibilité GitHub restent inchangés.

La [CI de `7cf0978`](https://github.com/lacombechristophe/freelio/actions/runs/40050051885) est refusée avant démarrage pour facturation/plafond GitHub. Le [reçu CI](ci-7cf0978.json) confirme quatre jobs et zéro étape exécutée. Le message générique ne prouve ni carte enregistrée ni paiement refusé. La recette Docker locale ci-dessus apporte sa propre preuve Linux ; la CI distante et les E2E restent ouverts.

## Reproduction et limites

Dans une copie installée avec ce lockfile, un client Prisma correspondant à la base de test et un binaire Chromium explicitement choisi, exécuter les commandes de la [CI](../../../.github/workflows/ci.yml). Utiliser une base fictive isolée : les intégrations écrivent et suppriment leurs propres fixtures. Les cas PDF sont `pdf-generator.integration.test.ts`, `delivery-pdf-native.integration.test.ts`, `pdf-print-layout.test.ts`, `pdf-image-security.test.ts` et `pdf-render.test.ts`.

Les rendus Windows et Docker/Linux sont qualifiés dans leurs périmètres respectifs ; le binaire Chromium de Vercel, les interactions navigateur authentifiées, la charge et les fournisseurs réels ne le sont pas. Zéro avis signalé est un résultat daté du registre npm, pas une garantie d’absence de vulnérabilité. L’ancien [run CI de `10920b4`](https://github.com/lacombechristophe/freelio/actions/runs/40043461170) et sa preview protégée restent des observations historiques, distinctes des contrôles ci-dessus. Main et production ne sont pas promus par cette recette.
