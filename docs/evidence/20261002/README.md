# Preuves locales conservées — 2 octobre 2026

Ces rapports décrivent des recettes locales avec données fictives. Ils ne sont ni une certification ni une attestation indépendante. Les originaux complets restent dans les dossiers de recette externes ; `receipts.json` en conserve les hashes. Les rapports Vitest et Playwright sont des projections contenant uniquement les cas, états et durées, sans configuration privée, sorties ou pièces.

| Fichier | Portée |
| --- | --- |
| `unit-postgres.json` | Nouvelle suite du 2 octobre : 456 réussites, un test SQLite exclu |
| `unit-sqlite.json` | Nouvelle suite du 2 octobre : 457 réussites, aucune exclusion |
| `e2e-desktop.json` | 19 parcours répétés le 2 octobre sur serveur compilé et PostgreSQL neuf |
| `public-demo.json`, `public-demo-mobile.json` | Huit contrôles desktop et neuf mobiles répétés le 2 octobre, profil lecture seule qualifié en local |
| `public-demo-db-role.json` | Sept contrôles des permissions SQL du compte lecteur |
| `linux-runtime.json` | Identité de l’image et huit contrôles Linux/PostgreSQL/Redis/worker/Chromium |
| `recovery.json` | Restauration native de base, pièces et archive chiffrée dans une cible neuve |
| `load-demo.json`, `load-memory.json` | Seconde charge réussie de 30 minutes et mémoire du processus Next |
| `load-demo-concurrent-build-failure.json` | Première charge refusée : 56 erreurs pendant des builds simultanés |
| `coverage-concurrent-e2e-failure.json` | Timeout de préparation Prisma pendant un essai de couverture simultané aux E2E ; échec conservé |
| `coverage.json` | Exécution seule réussie : 457 tests et seuils de couverture sur six modules métier ciblés |
| `dependencies.json` | Lockfile, licences déclarées et audit npm sans vulnérabilité connue le 2 octobre |

Les dates de mesure figurent dans les rapports ; la date du dossier désigne leur conservation, pas une nouvelle exécution de chacun d’eux. Aucune base, sauvegarde, clé, compte de démo, cookie ou journal complet n’est livré ici.

Le [suivi CTO](../../execution-cto-20261001.md) précise les conditions et limites. `verified-source.json` identifie le commit de code et la correspondance de 658 fichiers avec les copies des suites SQLite et PostgreSQL ; les résultats locaux ne constituent pas une CI distante sur ce SHA.
