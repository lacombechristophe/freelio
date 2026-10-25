# Modèles de chantier : graphe, activité et audit

Code : `5970c15daa987f037d3ab92653b7a48fb28ffffd`. Le [diagnostic SQL](baseline.json) reproduit neuf assertions en échec sur `e3e61f8` : prérequis d’un autre modèle ou d’une autre société, audit perdu ou absent, version affichée ignorée et trois graphes instanciés avec un prérequis silencieusement supprimé. Ces cas ne représentent pas neuf vulnérabilités indépendantes. La [sonde exacte](baseline-probe.test.ts.txt) est conservée ; ses neuf cas passent ensuite dans la suite finale.

Le premier passage avait également un défaut de nettoyage du test : suppression de la société avant son client protégé par une clé étrangère. Seul cet ordre a été corrigé avant de rejouer la sonde sur une autre base neuve, toujours avec le code initial. Les neuf échecs produit et cet échec du harnais restent distingués.

Le [lecteur des modèles](../../../src/actions/projets/index.ts) construit les prérequis depuis les seules étapes du modèle déjà autorisé. Il ne charge plus l’étape étrangère par relation. Son identifiant et son libellé sont exclus de la réponse ; la fenêtre affiche « Prérequis indisponible ». Le lien historique demeure en base pour vérification, sans réparation automatique. Les compteurs conservent leurs restrictions de société/agence.

Création du modèle, création de ses étapes et audit obligatoire partagent une transaction. Activation/désactivation vérifient Opérations en écriture, société, booléen et version affichée, puis enregistrent état et audit dans une transaction sérialisable avec comparaison de version. Un refus d’audit annule la transition ; un ancien écran ne remplace pas une version plus récente. Les révisions avancent même avec une horloge figée. Une demande valide visant l’état déjà courant ne crée ni transition ni audit fictif.

À la création d’un chantier, la transaction vérifie que chaque prérequis appartient aux étapes précédentes du modèle, avec un ordre strictement inférieur. Référence étrangère, cycle ou étape ultérieure entraînent un refus avant création du chantier, de ses jalons et de son audit. Les modèles cohérents restent utilisables. Leur désactivation conserve les chantiers et jalons existants, et bloque leur nouvel usage.

La [fenêtre](../../../src/app/dashboard/projets/project-template-dialog.tsx) transmet la version reçue. Les commandes et champs suivent le droit d’écriture, la démo en lecture seule et l’attente d’une réponse ; l’ajout d’étapes respecte la limite existante de 40. Les refus conservent la saisie. Aucun nouveau formulaire ni changement de mise en page n’est introduit. Ces comportements interactifs sont couverts par un [parcours préparé](../../../tests/e2e/project-template-integrity.spec.ts), à exécuter sur ordinateur et mobile.

## Qualification

Les [résultats et empreintes](local.json) portent sur **3 505 tests dans 277 fichiers**, sans échec ni exclusion, sur SQLite fictive neuve avec couverture. Les 24 cas dédiés et les 12 cas de compteurs passent dans cette même suite ; les 209 cas ciblés et voisins passent également séparément. Le manifeste des fichiers exécutés correspond au commit. Les types, ESLint, Oxlint et le build de 76 pages passent ; 1 217 fichiers source et 710 versions installées sont comparés sans écart. Deux préfixes `v` de métadonnées Upstash sont normalisés dans le contrôle des versions.

Le lockfile et `package.json` sont inchangés depuis la [qualification Vite/Vitest](../20261021-test-toolchain/README.md). Ses audits datés et son inventaire restent applicables à ces mêmes fichiers ; ils ne constituent pas un nouvel audit du code applicatif. La couverture chiffrée concerne seulement les six modules configurés. Les sept contrôles du générateur/PDF natifs passent dans la suite complète.

**472 cas Playwright sont sélectionnés, 236 par surface ; aucun parcours applicatif n’est exécuté dans cette qualification.** Les tests SQL utilisent les vraies actions, adhésions, contraintes et déclencheurs d’échec d’audit ; session et cache sont simulés. Le test simultané utilise la sérialisation SQLite dans le même processus, sans preuve de concurrence native PostgreSQL. PostgreSQL, Linux, interactions navigateur et preview du même SHA restent à qualifier. Aucun paquet installé, migration, appel fournisseur, push, nouvelle CI, fusion ou publication dans ce lot.

Ce complément ne livre pas l’édition/pagination des modèles et ne qualifie pas tous les anciens lecteurs de Chantiers. Les preuves du [dossier chantier](../20261021-project-workspace/README.md) et de son [cycle de vie](../20261021-project-lifecycle/README.md) gardent leurs propres périmètres.

## Reproduction

Dans une copie isolée déjà installée, avec secrets fictifs et `DATABASE_URL` SQLite neuve, préparer la base par `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/project-template-integrity.integration.test.ts tests/unit/project-template-count.integration.test.ts --no-file-parallelism`. La suite complète utilise `run --coverage --no-file-parallelism`, sans build parallèle.

Pour retrouver le diagnostic, utiliser une autre copie isolée de `e3e61f8`, y placer la sonde conservée sous `tests/unit/project-template-integrity.integration.test.ts`, préparer une nouvelle base fictive et exécuter ce seul fichier. Les neuf échecs sont attendus ; le troisième argument de version fourni par la sonde est alors ignoré par l’ancienne action. La sélection navigateur se lit sans application par `node node_modules/@playwright/test/cli.js test --list --reporter=json`.
