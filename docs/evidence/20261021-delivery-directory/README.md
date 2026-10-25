# Historique complet des bons de livraison

Code : `60ecedc541be15e7c4ed3a2f9789fac5eeb20e2f`. La [règle métier](../../commandes-livraisons-scellement.md#historique-des-livraisons) décrit recherche, états, droits et limites.

Le [diagnostic](baseline.json) reproduit le plafond : 102 bons autorisés, seulement 100 renvoyés. La liste visible utilise désormais une requête paginée à 25, sans élargir le périmètre de société ou d’agence. Le total, les filtres et la recherche portent sur tout ce périmètre.

La [recette locale](local.json) passe **3 290 tests dans 269 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les 22 nouveaux cas et 62 cas voisins passent dans cette même exécution ; son manifeste correspond exactement aux fichiers suivis et ses 1 198 fichiers source au commit. Types, génération des routes, deux lints et build de 76 pages passent.

Les cas SQL couvrent pages sans doublon, note ancienne, recherche des relations, états historiques, droits révoqués, démo en lecture seule, références étrangères et absence de capture/empreinte/données financières dans la réponse. L’attente erronée de la première fixture pour le rôle Opérations est conservée dans les diagnostics ; ce rôle garde ses agences assignées.

Le parcours [livraison](../../../tests/e2e/delivery-seal.spec.ts) prépare 101 notes cohérentes supplémentaires et vérifie la cinquième page, la recherche, les états et l’absence de nouvel audit. Le parcours général conserve ses contrôles de stock, signature et PDF et cible la nouvelle région nommée. **460 cas sélectionnés, 230 par surface ; aucun navigateur exécuté.** PostgreSQL, Linux et déploiement restent à qualifier. Pas de migration ni de nouvel envoi ; les choix Commande/Ligne du formulaire restent un lot séparé.

Reproduction dans une copie isolée avec dépendances installées et secrets fictifs : créer une SQLite neuve avec `node scripts/prepare-dev-database.mjs`, puis `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism --reporter=json --outputFile=recette.json`. La couverture publiée concerne les six modules configurés, pas l’ensemble de l’application.
