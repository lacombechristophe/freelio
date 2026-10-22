# Ancien lecteur Chantiers : relations et périmètre

Code : `da18fb87d6a295fa8ef17c8f03b005a357fa7771`. Le [diagnostic](baseline.json) reproduit six assertions en échec sur `b535f5b` : références vers un modèle ou une agence d’une autre société pour Owner/Admin, site étranger et site d’une agence inaccessible pour Opérations. Il s’agit de quatre cas de relations incohérentes, pas de six vulnérabilités indépendantes. La [sonde exacte](baseline-probe.test.ts.txt) et son empreinte sont conservées.

Le [lecteur `getProjects`](../../../src/actions/projets/index.ts) utilise maintenant le périmètre société/agence partagé avec Opérations, puis exclut aussi les modèles étrangers. Les références sont filtrées dans la requête, avant pagination. Les modèles et agences inclus ne peuvent ainsi plus fournir le nom d’une autre société. Les dossiers cohérents, les références optionnelles et les restrictions des caches Client restent conservés. L’ordre par date de création puis identifiant rend la pagination déterministe lorsque plusieurs dates sont identiques. Une lecture ne répare aucune relation et ne crée aucun audit.

Aucun appel de l’interface à cet ancien lecteur n’a été trouvé : l’annuaire visible utilise `getProjectDirectory`, qualifié séparément. Le manifeste du build enregistre toutefois `getProjects` parmi les actions serveur de Chantiers. Les [métadonnées de qualification](local.json) ne conservent que le nom d’export et les routes concernées, sans identifiant d’action ni clé de chiffrement. Cette observation du build ne prouve pas une invocation HTTP ni un chemin d’exploitation ; le correctif est vérifié directement par les actions et SQL.

## Qualification

La [recette locale](local.json) passe **3 520 tests dans 278 fichiers**, sans échec ni exclusion, sur SQLite fictive neuve avec couverture. Les 15 cas dédiés et les six cas du diagnostic passent dans cette même exécution. Les 191 cas ciblés et voisins passent séparément. Le manifeste exécuté correspond aux fichiers du commit ; 1 218 fichiers source sont conformes et 710 versions installées correspondent au lockfile après normalisation de deux préfixes `v` Upstash. Types, ESLint, Oxlint et build de 76 pages passent.

Les cas dédiés vérifient les références étrangères, les témoins positifs Owner/Opérations, les dates identiques, la révocation d’agence et la suspension dans la même session, la lecture seule et l’absence de mutation historique. Ils utilisent les vraies actions, adhésions, droits et SQLite ; authentification et cache sont simulés.

Deux erreurs du harnais sont conservées séparément : la première fixture utilisait `name` au lieu de `label`/`address1` pour un site, empêchant les six tests de s’exécuter ; un passage suivant réinitialisait l’adhésion avant de retirer le mode démo du test. Ces préparations et nettoyages ont été corrigés, puis les contrôles rejoués sur une base neuve. Ils ne sont pas présentés comme des défauts produit.

Le lockfile et les fichiers package restent inchangés depuis la [qualification de l’outillage](../20261021-test-toolchain/README.md), dont les audits datés et l’inventaire sont conservés. Les sept contrôles générateur/PDF passent dans la suite complète ; la couverture ne concerne que les six modules configurés. **472 cas Playwright sont sélectionnés ; aucun parcours applicatif n’est exécuté et aucun nouveau parcours UI n’est ajouté pour ce lecteur sans appel d’interface.**

PostgreSQL, Linux, invocation HTTP compilée et preview du même SHA restent à qualifier. Ce lot ne complète pas tous les lecteurs ni la cohérence de toutes les relations d’un dossier. Aucun changement de schéma, installation, sortie fournisseur, push, nouvelle CI, fusion ou publication.

## Reproduction

Dans une copie isolée déjà installée, avec secrets fictifs et une `DATABASE_URL` SQLite neuve, préparer la base par `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/project-list-relations.integration.test.ts tests/unit/shared-client-readers.integration.test.ts tests/unit/project-directory.integration.test.ts --no-file-parallelism`. La suite complète utilise `run --coverage --no-file-parallelism`, sans build parallèle.

Pour le diagnostic initial, utiliser une autre copie isolée de `b535f5b`, y copier la sonde conservée sous `tests/unit/project-list-relations.integration.test.ts`, préparer une nouvelle base fictive et exécuter ce seul fichier. Les six échecs sont attendus.
