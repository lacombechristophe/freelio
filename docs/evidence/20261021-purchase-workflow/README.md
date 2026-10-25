# Historique et transitions des achats fournisseur

Code : `cd91aa41805f8667e625e3f2803b15147716ac60`. `be2a4ef` complète la recherche et les compteurs ; `cd91aa4` protège soumission, approbation, transmission déclarée et accusé. Les [règles](../../gestion-brouillons-achats.md) précisent les états, les droits et les parcours restant distincts.

La [recette locale](local.json) passe **3 182 tests dans 265 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les cinq suites achat représentent **180 cas dans cette même exécution**, dont 22 sur l’historique et 48 sur les transitions. Le manifeste exécuté correspond aux fichiers de tests suivis par Git ; les 1 185 fichiers source de la recette correspondent au commit.

Les [diagnostics](baseline.json) conservent le plafond de 100 du lecteur précédent et 34 échecs sur les 44 cas de transition alors présents. Les 21 cas non sélectionnés du diagnostic de liste ne sont pas des exclusions de la suite finale. Ce compteur ne représente pas 34 vulnérabilités indépendantes. Un premier passage de la nouvelle liste expose aussi deux échecs de filtre d’agence ; ils sont conservés dans les métadonnées, puis corrigés en excluant les commandes sans chantier de l’agence sélectionnée.

Les cas SQL vérifient 151 achats actifs derrière 101 commandes fermées, pages stables sans doublons, recherche avant pagination, rôles, sociétés, références et agences. Une réception ou une modification SQL achevée entre préparation et transaction reste conservée. Un trigger refuse réellement l’insertion de l’audit : état et audit sont annulés ensemble. Les fournisseurs ne sont pas contactés ; « Marquer envoyée » reste la trace d’une transmission effectuée hors de cette action.

Types, ESLint, Oxlint (1064 fichiers, 21 règles) et build Next de 76 pages passent. Les journaux originaux sont hachés dans le rapport. La couverture activée conserve les six modules configurés ; elle ne mesure pas toute l’application.

## Reproduction et limites

Dans une copie isolée avec les dépendances installées, définir une DATABASE_URL SQLite neuve et des secrets fictifs de recette. Préparer le schéma avec `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism --reporter=json --outputFile=recette.json`. Ne pas utiliser de base existante. Les deux nouvelles suites sont `tests/unit/purchase-directory.integration.test.ts` et `tests/unit/purchase-transitions.integration.test.ts`.

Le scénario Playwright existant recherche un achat derrière 101 commandes fermées, combine les filtres et ouvre son éditeur ; il conserve les contrôles de création, refus périmé et annulation. **456 cas sélectionnés, 228 par surface, aucun navigateur exécuté.** Les intercalages SQL déterministes ne remplacent pas une qualification de concurrence native PostgreSQL. La syntaxe PostgreSQL du trigger est préparée seulement. Aucun serveur local, conteneur, nouvel appel fournisseur, push, nouvelle CI distante, fusion ou déploiement n’a été lancé. La modification après soumission et l’annulation après transmission ou réception restent des parcours distincts ; L8/L9 ne sont pas fermés par ce complément.
