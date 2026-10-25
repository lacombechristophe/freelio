# Réservations de stock : références et audit atomiques

Code : `6e2f41b4e0d9f6386a38a5f1f85b0f1ffb4fd351`. Le [contrat](../../contrat-reservations-relations-droits.md#recontrôle-et-audit-transactionnels--21-octobre) complète les contrôles initiaux sans remplacer les protections de solde et de rejeu.

Le [diagnostic](baseline.json) conserve dix échecs initiaux : références modifiées après préparation encore acceptées, fournisseur étranger, audit absent ou refusé après l’opération. Il ne représente pas dix vulnérabilités indépendantes. Le témoin cohérent avait conservé ses bonnes quantités et ses quatre mouvements, mais seulement un audit sur quatre.

Les références et la réservation préparée sont relues dans la transaction sérialisable. Les revendications conditionnelles de solde et d’état ACTIVE restent appliquées. Création, libération et consommation y écrivent aussi leur audit ; une insertion refusée annule solde, mouvement, réservation et éventuel passage de commande en préparation. Les changements de référence introduits par la fixture restent conservés après refus.

La [recette locale](local.json) passe **3 337 tests dans 271 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les 18 cas dédiés et 112 voisins passent dans cette même exécution, dont les contrôles existants de concurrence et de dépôts. Manifeste exact et 1 204 fichiers source conformes au commit ; types, génération des routes, deux lints et build de 76 pages passent. Les diagnostics du harnais (proxy de transaction, types des lectures simulées et nom local interdit par Next) restent conservés ; les assertions métier ne sont pas retirées.

Les vrais déclencheurs SQL prouvent le rollback d’audit. Les changements de quantité à horodatage conservé sont délibérément injectés dans la base fictive ; les trois conflits P2034 sont simulés. Les 12 cas de concurrence existants exécutés sur SQLite ne qualifient pas PostgreSQL ni plusieurs processus. La couverture publiée reste celle des six modules configurés.

Les quatre contrôles du générateur PDF passent dans cette même suite, dont trois sur Chromium réel : rendu simple, ressource distante refusée et nettoyage après interruption. Ce socle ne qualifie pas les documents métier ni les parcours de l’application.

Le [parcours préparé](../../../tests/e2e/stock-reservation-integrity.spec.ts) utilise une société/utilisateur fictifs indépendants et la connexion normale : réserver, libérer, réserver, provoquer un refus d’audit à la consommation, vérifier les données conservées, puis consommer après retrait du défaut. Quatre mouvements et quatre audits sont attendus. **464 cas Playwright sélectionnés, 232 par surface ; aucun parcours Playwright exécuté.** Pas de migration ni d’envoi externe. Politiques de clôture/annulation, choix encore plafonnés, réparation historique, PostgreSQL, Linux, interactions navigateur et déploiement restent distincts.

Reproduction dans une copie isolée déjà installée avec secrets fictifs et DATABASE_URL SQLite neuve : `node scripts/prepare-dev-database.mjs`, puis `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism --reporter=json --outputFile=recette.json`.
