# Contribuer à Freelio

Le projet est une application de démonstration. Travailler avec des données fictives et des secrets propres à la recette. Le [README](README.md) décrit les prérequis ; le [guide de test](docs/testing.md) précise les contrôles attendus. Les anciens résultats restent dans les [archives](docs/history.md).

## Développement avec PostgreSQL

Docker Compose prépare PostgreSQL et Redis de développement sur l’interface locale :

```powershell
docker compose up -d --wait
$env:DATABASE_URL = "postgresql://freelio_dev:local-only-freelio-development@127.0.0.1:55432/freelio_dev?schema=public"
$env:REDIS_URL = "redis://127.0.0.1:56379/0"
npm ci
npm run db:deploy:postgres
```

Configurer ensuite les secrets de développement à partir de [.env.example](.env.example), puis lancer `npm run dev`. Les identifiants Compose sont publics et réservés à ces services locaux. Ne pas copier une base existante pour créer les fixtures. Les volumes persistent après `docker compose down` ; l’option `-v` les détruirait et ne sert pas à reprendre le développement.

## Préparer un changement

Partir d’un état Git identifié. Lire AGENTS.md et les guides de la version Next installée avant de modifier ses conventions. Créer une branche `codex/…` ou suivre la convention demandée pour la contribution. Garder les corrections métier séparées des changements de présentation.

Choisir un nom court qui décrit le changement, par exemple `codex/pdf-timeouts` ou `codex/import-actions`. Retirer les branches de travail fusionnées après vérification de leurs commits ; conserver les références de retour arrière utiles et l’historique des PR.

Définir un résultat vérifiable : scénario déclencheur, comportement attendu, portée entreprise/agence/rôle et comportement d’échec. Appliquer les corrections nécessaires dans le périmètre confié. Faire trancher les coûts, publications irréversibles, changements de direction et compromis métier incertains par le propriétaire. Ne pas élargir le lot au passage.

## Vérifier

Exécuter types, lint, tests pertinents puis build. Utiliser exclusivement une base isolée pour les tests SQL et les fixtures ; ne jamais lancer `verify`, un seed ou `db push` sur une base partagée. `npm run test:unit -- tests/unit/nom-du-fichier.test.ts` conserve l'option `--no-file-parallelism` du dépôt. Un appel direct à Vitest doit aussi la fournir pour éviter les collisions entre fixtures SQL ; la concurrence explicitement testée dans un fichier reste active.

`npm run lint` exécute ESLint puis Oxlint : les deux moteurs sont requis. La [politique](tooling/lint/README.md) conserve les niveaux de règles antérieurs et les cas de contrôle. Une évolution de Next ou d’un plugin doit vérifier cette politique et la règle Next conservée sous licence MIT.

Pour une règle financière ou un droit d’accès, ajouter une régression qui reproduit le défaut. Pour une migration, vérifier une base vide et une base représentative de la version précédente. Pour un flux utilisateur, utiliser le serveur compilé avec `E2E_USE_PRODUCTION_SERVER=true`, avec son moteur SQL et des identifiants fictifs.

Les fixtures E2E sont consommées par les parcours. `seed-e2e.mjs` réutilise une entreprise déjà présente et ne réinitialise pas ses dossiers : chaque recette complète doit donc partir d’une base neuve. Une nouvelle base est préférable à une suppression globale. Les contextes navigateur destinés aux visiteurs anonymes doivent déclarer un `storageState` vide.

## Revue et livraison

Décrire le problème et le comportement final, les preuves exécutées et les limites. Identifier les fichiers d’environnement, données, pièces et traces privées avant partage. `node scripts/check-publication.mjs --history` recherche certaines signatures connues ; ce contrôle ne garantit pas l’absence de tous les secrets possibles.

`node scripts/inventory-dependencies.mjs` relève les métadonnées du lockfile et les licences à examiner. `node scripts/fingerprint-source.mjs` décrit le commit de base et les empreintes du code local, y compris les fichiers nouveaux ; une référence avec changements non commités doit être annoncée comme telle. Pour vérifier une image locale : `node scripts/verify-container-runtime.mjs IMAGE IMAGE_DEMO` crée exclusivement des services fictifs dédiés et conserve son rapport. Ce contrôle écrit dans sa propre base et sa propre file.

Ne pas publier de bases, sauvegardes, `.env`, identifiants de recette ni traces contenant des cookies. Garder les détails de configuration sensibles dans le gestionnaire de secrets. Conserver les notices des dépendances et assets. Le propriétaire conserve pour l’instant le code propre sans licence de redistribution. Une contribution ne doit pas attribuer cette licence à sa place.

Un build ou un workflow écrit ne constitue pas une preuve de livraison. La version candidate doit être reliée à ses résultats CI, à son image et à une restauration vérifiée. Les dépenses, fournisseurs et publication se décident sur un résultat de préproduction concret.
