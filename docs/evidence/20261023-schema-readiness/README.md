# Disponibilité : connexion, schéma et migrations

La sonde de disponibilité se limitait à `SELECT 1` et à la configuration. Trois tests SQL reproduisent un HTTP 200 avec une table ou une colonne manquante, y compris en démonstration publique ; le témoin sur une base saine passe.

## Contrat

`/api/health/live` reste la sonde de vie. `/api/health/ready` exige désormais connexion, configuration et contrôle du schéma avant de répondre 200 ; sinon elle répond 503. La réponse distingue ces trois composants, sans nom de table, migration, fichier, URL de base ou détail d’exception.

Le contrôle compare les tables et colonnes scalaires du modèle Prisma aux catalogues : présence, famille de type et nullabilité. Les relations objet ne sont pas prises pour des colonnes ; les noms physiques mappés sont pris en compte. Le modèle courant représente 143 tables et 1 775 colonnes. Une transaction lit les métadonnées ; les données métier ne sont pas consultées.

Sur PostgreSQL, toutes les migrations livrées doivent posséder un enregistrement terminé, non révoqué et de checksum compatible. Une migration manquante, inconnue, en cours, dupliquée ou modifiée empêche la disponibilité. Les tentatives explicitement annulées ne remplacent pas une application réussie. Le contrôle suit les règles LF/CRLF et ancien format hexadécimal du [moteur Prisma installé](https://github.com/prisma/prisma-engines/blob/8047c96bbd92db98a2abc7c9323ce77c02c89dbc/schema-engine/connectors/schema-connector/src/checksum.rs). Le manifeste du livrable est conservé en mémoire ; le résultat de la base ne l’est pas.

La lecture PostgreSQL utilise les [catalogues de colonnes](https://www.postgresql.org/docs/18/catalog-pg-attribute.html) et le schéma configuré dans l’URL de connexion, passé comme valeur liée. Le journal Prisma est qualifié explicitement avec ce même schéma : son identifiant est cité, ses guillemets sont échappés, et le contrôle ne dépend pas du `search_path`. Le garde-fou refuse un journal situé dans un autre schéma. Le rôle applicatif doit pouvoir lire ses quatre colonnes de suivi : `migration_name`, `checksum`, `finished_at`, `rolled_back_at`. La sonde n’accorde aucun droit et n’exécute aucune migration.

En démo publique, seules les requêtes de métadonnées exactes sont ajoutées au garde-fou transactionnel. Les SQL arbitraires, variantes exécutables et lectures de données métier restent refusés. Le chemin de connectivité hors transaction garde son contrôle existant. Les SQL de migration sont inclus dans la trace de cette seule route Next.js.

Un échec produit un événement serveur `schema_readiness_failed`, avec l'étape `migration_files`, `columns` ou `migration_history`. Un désaccord indique seulement les comptes attendus/observés ; une exception conserve un code Prisma ou système explicitement autorisé. Le message, la pile, les chemins, identifiants et valeurs de connexion ne sont jamais transmis au journal par ce diagnostic. La réponse HTTP garde son contrat minimal.

## Preuves et reproduction

La [première recette de `cebe3a1`](local.json) passe 61 cas ciblés puis 4 037 tests. Une vérification complémentaire reproduit une lecture du journal non qualifiée : le test d’orchestration exige le schéma configuré et échoue avant correction. `9f9ab2b` qualifie cet identifiant et vérifie son échappement ainsi que le refus d’un autre schéma.

La [recette finale de `9f9ab2b`](local-final.json) repasse **61 cas ciblés dans six fichiers**, puis **4 037 tests dans 302 fichiers** sur une autre SQLite neuve, sans échec ni exclusion, en 663,34 secondes. Les 43 nouveaux cas comprennent cinq intégrations SQLite/HTTP, 25 validations pures ou fichiers, huit contrôles d’orchestration PostgreSQL simulée et cinq contrôles de frontière HTTP simulée.

Types, ESLint/Oxlint et build propre Next.js 16.4.2 de 76 pages passent ; 1 276 fichiers de source correspondent au commit. Les 73 SQL de migration figurent dans la trace du livrable de la sonde, avec contenu identique aux sources. Les seuils de couverture passent sur les six modules configurés, sans mesure globale de l’application. Les 522 E2E dans 105 fichiers restent sélectionnés sans exécution locale.

Dans une copie installée, préparer une SQLite fictive neuve avec `node scripts/prepare-dev-database.mjs`, puis lancer :

```sh
node node_modules/vitest/vitest.mjs run tests/unit/schema-readiness.integration.test.ts tests/unit/schema-readiness.test.ts tests/unit/schema-readiness-postgres.test.ts tests/unit/schema-readiness-route.test.ts tests/unit/readiness.test.ts tests/unit/public-demo-database.integration.test.ts --no-file-parallelism
```

Les tests SQL renomment temporairement une table ou une colonne dans leur propre base et restaurent ces références. La configuration est simulée pour isoler le contrôle de structure ; aucun serveur applicatif n’est lancé. Les contrôles d’orchestration PostgreSQL utilisent un transport simulé et ne prouvent pas une connexion PostgreSQL réelle.

Un diff Prisma statique, sans connexion, produit le DDL PostgreSQL de 143 tables ; ses 1 775 colonnes correspondent aux familles de types/nullabilités attendues par le contrôle. Ce résultat ne prouve pas que les migrations versionnées ont été appliquées sur une base existante.

## Limites

Ce contrôle ne constitue pas un audit complet de dérive : il ne vérifie pas index, clés étrangères, défauts, précision des types, collations, triggers ni contenu des données. Des colonnes historiques supplémentaires sont tolérées. SQLite est contrôlée sur sa structure ; elle n’utilise pas le journal des migrations PostgreSQL.

Les migrations et le schéma réellement déployés, l’image Linux et les parcours authentifiés doivent encore être qualifiés sur le candidat. Une preview marquée READY par l’hébergeur ne remplace pas le résultat de la sonde HTTP.
