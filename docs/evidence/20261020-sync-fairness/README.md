# Synchronisation : boîtes jamais sélectionnées

Deux diagnostics du commit `1dd29efceb0a0799ecc847053b4521c8dc7c0315` échouent. Avec six boîtes actives et trois lots de deux, le planificateur examine seulement les deux premières. Le cas existe avec des connexions calendrier seul ; il existe aussi lorsque les premières boîtes échouent. Les quatre autres n'atteignent jamais leurs traitements.

Le tri utilise `lastSyncAt`, qui décrit un succès mail et ne mesure pas une tentative calendrier ou un échec. Le [résultat](baseline.json) et la [source](reproduction.test.ts.txt) conservent la reproduction. La sélection, les écritures de configuration et la boucle utilisent une nouvelle SQLite réelle ; les deux services mail/calendrier sont remplacés par des stubs explicites. Ce diagnostic ne qualifie pas les fournisseurs, le parallélisme de plusieurs instances ou PostgreSQL.

Pour reproduire dans une copie isolée avec une nouvelle base fictive préparée, copier la source dans `tests/unit/sync-fairness-baseline.integration.test.ts`, puis lancer `node node_modules/vitest/vitest.mjs run --no-file-parallelism tests/unit/sync-fairness-baseline.integration.test.ts`.

Le correctif OPS-03 doit séparer tentative et succès, garantir une progression bornée malgré les pannes et les connexions calendrier seul, préciser le tri des valeurs historiques nulles sur les deux moteurs et conserver les protections de connexion. Ces deux échecs sont distincts de la suite des conversations natives ; ils restent ouverts.
