# Qualification des dépendances et du planning

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

## Démonstration hébergée

La [preview dédiée](https://freelio-demo-77c40cf.vercel.app) pointe vers un déploiement de `7cf0978`, qui contient ce code et sa documentation. Après correction des trois URL canoniques de la branche Preview et reconstruction de cette même version, les sondes anonymes `/api/health/live` et `/api/health/ready` répondent HTTP 200 ; base, schéma et configuration sont OK. Le [reçu hébergé](hosted-7cf0978.json) lie ces réponses au déploiement exact. Les trois URL sont vérifiées dans la configuration de branche ; un parcours de connexion n’est pas déduit de cette vérification.

L’exception de protection Vercel concerne cet alias dédié, rattaché manuellement à la version qualifiée. Les quatre URL de contrôle, dont la branche et le déploiement brut, redirigent toujours vers Vercel SSO. Les premiers essais au niveau du déploiement ont été annulés : le premier n’a pas conservé ses réponses HTTP ; le second confirme HTTP 200 après propagation mais échoue au contrôle d’isolation. Leurs reçus et ces limites sont conservés. L’exception finale est portée par l’alias, sans lien secret de partage, invitation, abonnement ou désactivation globale de protection. Les exceptions sont [disponibles sur tous les plans Vercel](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/deployment-protection-exceptions).

Les cinq réglages de démonstration sont vérifiés sur la branche : lecture seule côté serveur et client, données fictives et deux pilotes de stockage désactivés. Aucun nom de secret fournisseur interdit n’est présent dans ce périmètre ; aucune valeur de secret fournisseur n’est lue. Les paramètres de production et la visibilité GitHub restent inchangés.

La [CI de `7cf0978`](https://github.com/lacombechristophe/freelio/actions/runs/40050051885) est refusée avant démarrage pour facturation/plafond GitHub. Le [reçu CI](ci-7cf0978.json) confirme quatre jobs et zéro étape exécutée. Cette condition n’est pas un échec de test applicatif ; elle laisse néanmoins la qualification Linux et E2E du candidat ouverte.

## Reproduction et limites

Dans une copie installée avec ce lockfile, un client Prisma correspondant à la base de test et un binaire Chromium explicitement choisi, exécuter les commandes de la [CI](../../../.github/workflows/ci.yml). Utiliser une base fictive isolée : les intégrations écrivent et suppriment leurs propres fixtures. Les cas PDF sont `pdf-generator.integration.test.ts`, `delivery-pdf-native.integration.test.ts`, `pdf-print-layout.test.ts`, `pdf-image-security.test.ts` et `pdf-render.test.ts`.

Ces contrôles Windows et HTTP ne qualifient pas le binaire Chromium Linux de l’image ou de Vercel, les interactions navigateur authentifiées, la charge ou un fournisseur réel. Zéro avis signalé est un résultat daté du registre npm, pas une garantie d’absence de vulnérabilité. L’ancien [run CI de `10920b4`](https://github.com/lacombechristophe/freelio/actions/runs/40043461170) et sa preview protégée restent des observations historiques, distinctes des contrôles ci-dessus. Main et production ne sont pas promus par cette recette.
