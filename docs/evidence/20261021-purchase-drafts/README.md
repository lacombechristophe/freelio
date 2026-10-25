# Achats : édition des brouillons et annulation avant transmission

Code : `b780638e186d99c7f65e6776babee87fc15ccad0` ; production : `86485f2e3d02c88fc996f92008db2de8f9b4bc3f`. Le second commit adapte uniquement le test de panne d’audit aux deux syntaxes SQL et son nettoyage. Les [règles](../../gestion-brouillons-achats.md) définissent états, droits, révision et limites.

La recette [local.json](local.json) consigne **3 112 réussites / 263 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Le manifeste des fichiers exécutés correspond exactement aux tests suivis par Git. Les trois suites achat représentent 110 cas dans cette même exécution, dont 51 sur édition/annulation.

La révision du parent et des lignes empêche un ancien formulaire d’écraser une édition. Deux écritures concurrentes ne produisent qu’un succès et un audit. Un trigger fictif refuse réellement l’insertion SQL de l’audit après les écritures métier ; la transaction restaure alors commande et lignes. Les quantités, prix en centimes, plafond SQL, dates impossibles, rôles, sociétés, agences et démo en lecture seule sont contrôlés. Les identifiants et références d’import des lignes conservées ne changent pas.

Le [diagnostic initial](baseline.json) sélectionne deux tests de fonctionnalités absentes : leurs exports n’existaient pas. Il ne représente pas deux régressions de production. Une première tentative d’injection de panne par spy était incompatible avec le proxy Prisma ; ces deux échecs de test sont conservés dans les métadonnées et remplacés par le refus SQL réel, sans exclusion ni retrait des contrôles d’état.

Types, ESLint, Oxlint et build passent ; les journaux sont hachés dans le rapport. Oxlint examine 1 059 fichiers avec 21 règles configurées. La couverture activée porte sur les six modules déjà configurés, sans pourcentage global de l’application. Les 1 180 fichiers sources de la recette correspondent au commit, hors documentation et fichiers d’environnement.

## Reproduction et limites

Sur une copie isolée avec dépendances installées et une DATABASE_URL SQLite neuve : préparer le schéma avec `node scripts/prepare-dev-database.mjs`, puis exécuter `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism --reporter=json --outputFile=recette.json`. La suite ciblée est `tests/unit/purchase-draft-lifecycle.integration.test.ts`. N’utiliser aucune base existante pour cette recette.

Le scénario Playwright existant est étendu à création, édition, refus périmé et annulation motivée sur desktop/mobile ; **456 cas sélectionnés, aucun navigateur exécuté**. La syntaxe PostgreSQL du trigger est préparée, pas qualifiée. Aucun serveur local, conteneur, fournisseur, appel d’envoi, push, CI distante, fusion ou déploiement n’a été lancé. Les comptes réels et l’annulation après transmission sont hors de ce lot. La liste générale des achats reste plafonnée à 100 : ce lot ne clôt pas L8/L9.
