# Contribuer à Freelio

Le projet est une application de démonstration. Travailler avec des données fictives et des secrets propres à la recette. Le [README](README.md) décrit les prérequis ; le [suivi CTO](docs/execution-cto-20261001.md) indique les preuves réellement obtenues.

## Préparer un changement

Partir d’un état Git identifié. Lire AGENTS.md et les guides de la version Next installée avant de modifier ses conventions. Créer une branche `codex/…` ou suivre la convention demandée pour la contribution. Garder les corrections métier séparées des changements de présentation.

Définir un résultat vérifiable : scénario déclencheur, comportement attendu, portée entreprise/agence/rôle et comportement d’échec. Toute modification visible exige un lot précisément approuvé par le propriétaire du projet. Ne pas élargir le lot au passage.

## Vérifier

Exécuter types, lint, tests pertinents puis build. Utiliser exclusivement une base isolée pour les tests SQL et les fixtures ; ne jamais lancer `verify`, un seed ou `db push` sur une base partagée. Les tests SQL s’exécutent sans parallélisme entre fichiers pour éviter les collisions sur leurs fixtures.

Pour une règle financière ou un droit d’accès, ajouter une régression qui reproduit le défaut. Pour une migration, vérifier une base vide et une base représentative de la version précédente. Pour un flux utilisateur, utiliser le serveur compilé avec `E2E_USE_PRODUCTION_SERVER=true`, avec son moteur SQL et des identifiants fictifs.

Les fixtures E2E sont consommées par les parcours. `seed-e2e.mjs` réutilise une entreprise déjà présente et ne réinitialise pas ses dossiers : chaque recette complète doit donc partir d’une base neuve. Une nouvelle base est préférable à une suppression globale. Les contextes navigateur destinés aux visiteurs anonymes doivent déclarer un `storageState` vide.

## Revue et livraison

Décrire le problème et le comportement final, les preuves exécutées et les limites. Identifier les fichiers d’environnement, données, pièces et traces privées avant partage. `node scripts/check-publication.mjs --history` recherche certaines signatures connues ; ce contrôle ne garantit pas l’absence de tous les secrets possibles.

`node scripts/inventory-dependencies.mjs` relève les métadonnées du lockfile et les licences à examiner. `node scripts/fingerprint-source.mjs` décrit le commit de base et les empreintes du code local, y compris les fichiers nouveaux ; une référence avec changements non commités doit être annoncée comme telle. Pour vérifier une image locale : `node scripts/verify-container-runtime.mjs IMAGE` crée exclusivement des services fictifs dédiés et conserve son rapport. Ce contrôle écrit dans sa propre base et sa propre file.

Ne pas publier de bases, sauvegardes, `.env`, identifiants de recette ni traces contenant des cookies. Garder les détails de configuration sensibles dans le gestionnaire de secrets. Inventorier les licences du code et des assets avant ouverture du dépôt ; aucune licence publique du code propre n’est décidée ici.

Un build ou un workflow écrit ne constitue pas une preuve de livraison. La version candidate doit être reliée à ses résultats CI, à son image et à une restauration vérifiée. Les dépenses, fournisseurs et publication se décident sur un résultat de préproduction concret.
