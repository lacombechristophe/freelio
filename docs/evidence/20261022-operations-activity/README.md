# Totaux et aperçus Opérations

Code : 8461d449f5a9a29a43e64e2ada0d92f03ab07d2d. Les compteurs SAV ouverts et Interventions à venir dépendaient des 200 lignes chargées ; la comparaison des agences comptait les 100 sites et 300 chantiers du cache. Des dossiers clôturés pouvaient occuper ce chargement et faire afficher « Aucune priorité opérationnelle » malgré des dossiers ouverts.

La [sonde](baseline-probe.test.ts.txt), sur 338a702, reproduit [sept observations en échec et un témoin positif](baseline.json). Elles proviennent de quatre plafonds, pas de sept vulnérabilités indépendantes. Son adaptateur lit les données réellement renvoyées par l’ancienne action ; il ne fait pas fonctionner l’interface. Les tests finaux interrogent directement les données corrigées.

Le [lecteur](../../../src/lib/operations/activity-summary.ts) calcule les totaux SQL et les six éléments de chaque aperçu dans une même transaction. Il applique les mêmes prédicats de société, de références et d’agence aux compteurs et aux aperçus. Les compteurs Sites/Chantiers utilisent les relations SQL de chaque agence. Stock, Achats, équipe et dépôts conservent leurs calculs existants.

Les tickets ouverts excluent RESOLVED, CLOSED et MERGED. Les interventions à venir commencent à l’instant observé ou après ; l’aperçu du jour inclut aussi les retards, jusqu’au lendemain civil de la société, borne exclue. COMPLETED et CANCELED sont exclus. Les sites gardent la définition historique existante, les chantiers celle des ACTIVE. Le tri alphabétique existant des priorités ticket est conservé, avec un identifiant pour stabiliser les égalités ; ce lot n’introduit pas un nouveau classement métier des priorités.

Lors d’un changement d’agence, [le client](../../../src/app/dashboard/operations/use-operations-activity.ts) distingue chargement, résultat et erreur pour la combinaison agence/source/reprise. Il ignore une réponse devenue ancienne. Une indisponibilité affiche un tiret et une commande de reprise ; elle ne devient pas un zéro ni un état « Sous contrôle ». Les aperçus indiquent le nombre affiché sur le total.

## Qualification

La [recette](local.json) passe **3 643 tests dans 282 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les **30 cas dédiés** et **141 cas ciblés/voisins** passent. Ils couvrent les plafonds initiaux, 10 001 tickets supplémentaires, les agences et sociétés, les références étrangères, l’absence d’affectation, l’authentification, la démo en lecture seule, la projection minimale et les deux changements d’heure de Paris. Le lecteur impose aussi le périmètre fourni hors contexte de requête.

Types, ESLint, Oxlint et build de 76 pages passent. Les 1 233 fichiers source concordent avec ce commit ; 710 versions installées correspondent au lockfile après deux normalisations de préfixe v. Les audits de l’[outillage inchangé](../20261021-test-toolchain/README.md) restent datés. Les sept contrôles générateur/PDF passent dans la suite complète ; la couverture ne concerne que les six modules configurés.

Les rapports intermédiaires sont conservés dans local.json : attentes de test trop larges pour les tickets sans agence, limite de nettoyage de la fixture volumineuse, adaptateur de diagnostic devenu incompatible avec les types finaux, puis corrections. Le nettoyage est découpé en lots de 250 et dispose de 30 secondes ; le délai normal des assertions métier reste inchangé. La durée du cas volumineux inclut préparation/nettoyage et ne mesure pas un SLO de requête. Un premier prébuild sans DATABASE_URL explicite a été refusé ; le build qualifié utilise une configuration fictive isolée.

**486 cas Playwright sont sélectionnés, dont deux nouveaux desktop/mobile ; aucun parcours applicatif n’est exécuté.** Le nouveau parcours prépare les totaux, aperçus, compteurs d’agence, panne réseau, reprise et saisie conservée. Les tests SQL ne prouvent pas ces interactions React. Authentification et cache Next sont simulés ; SQL, contrôles de droits et données sont réels.

## Limites et reproduction

Les caches Tickets/Interventions/Maintenance et certains sélecteurs restent utilisés par d’autres vues ; leurs listes complètes, le classement métier des priorités et les écritures sont des travaux distincts. PostgreSQL, Linux, navigateur, CI distante et preview du même SHA restent à qualifier. Aucun schéma, dépendance, licence, installation ou envoi fournisseur réel ne change. Aucun push, fusion ou déploiement : le plafond GitHub Actions à 0 € avec arrêt de l’usage payant reste à attester.

Dans une copie déjà installée, avec secrets fictifs et une DATABASE_URL SQLite neuve : préparer par `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/operations-activity-summary.integration.test.ts tests/unit/operations-dashboard-relations.integration.test.ts tests/unit/operations-stock-directory.integration.test.ts tests/unit/operations-project-choices.integration.test.ts tests/unit/public-demo-database.integration.test.ts tests/unit/public-demo.test.ts --no-file-parallelism`. La suite complète utilise run --coverage --no-file-parallelism, sans build parallèle.

Pour le diagnostic, copier la sonde dans une autre recette de 338a702, sous tests/unit/operations-activity-summary.integration.test.ts, préparer une base neuve et lancer ce seul fichier. Sept échecs et un témoin positif sont attendus.
