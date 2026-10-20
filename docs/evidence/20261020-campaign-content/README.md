# Préflight du contenu des campagnes

Quatre diagnostics du code `a7779b8` échouent : capture autorisée avec une variable inconnue, un lien relatif perdu par nettoyage ou un corps devenu vide ; réinterprétation d'une valeur de contact comme variable de société. La [reproduction](reproduction.test.ts.txt) et le [rapport avant correction](baseline.json) sont conservés. Les quatre modules concernés sont restaurés depuis Git dans une copie isolée avec SQLite neuve ; ce diagnostic n'est pas une qualification de toute l'application ancienne.

`d00d517` ajoute le rapport de lecture « Vérifier le contenu », puis contrôle le contenu à la capture, au démarrage/reprise et pendant les lots. Une capture historique invalide est mise en pause avec son diagnostic et son snapshot conservé. La personnalisation remplace une variable une seule fois et conserve les valeurs comme données ; le texte et les liens sont revérifiés après remplacement, avant le pied de retrait. Une erreur de contenu bloque le nouvel envoi et met l'inscription en pause, sans reprises automatiques ; les réparations d'envois déjà acceptés gardent leur parcours. Le [contrat](../../contrat-preflight-contenu-campagnes.md) délimite précisément ces contrôles.

La première suite passe 2 942 tests, mais le fichier SSR en .tsx ne correspond pas au manifeste .test.ts de Vitest. `59cbad2` corrige uniquement son nom et sa syntaxe React.createElement, sans modifier ses assertions ni le code de production. Les deux cas passent ensuite réellement et la suite finale vérifie explicitement leur présence. Ce diagnostic n'est pas présenté comme un succès SSR antérieur.

Les [résultats](local.json) de `59cbad2254d2f55f2bda03d1e82c647d18f3c00e` passent **2 944 tests dans 256 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Les neuf fichiers ciblés y regroupent 77 cas réussis, dont les deux SSR, audiences de 10 001 membres, droits/sociétés, lecture seule, diagnostics bornés, anciens snapshots et arrêt avant transport. Types et lints passent ; le build de 76 pages statiques de `d00d517` reste applicable au même code de production, avec diff des deux tests conservé. 1165 fichiers source correspondent à la recette. Les erreurs de fixture et rapports intermédiaires restent identifiés ; un essai de traitement ne constitue pas la preuve d'une requête fournisseur.

Dans une copie avec une base fictive préparée :

```sh
node node_modules/vitest/vitest.mjs run --no-file-parallelism tests/unit/campaign-preflight.integration.test.ts tests/unit/email-preflight.test.ts tests/unit/campaign-content-report.test.ts tests/unit/campaign-activation.integration.test.ts tests/unit/campaign-dispatch.integration.test.ts tests/unit/sequence-history.integration.test.ts tests/unit/campaign-management.integration.test.ts tests/unit/email-content.test.ts tests/unit/sequence-retry-safety.integration.test.ts
```

Les 456 cas navigateur sont sélectionnés, pas exécutés. Le parcours campaign-activation.spec.ts vérifie désormais le rapport avant l'audience. SSR ne qualifie que le rendu initial. PostgreSQL, Linux/runtime, interactions et comptes réels restent distincts. Quotas internes par boîte et contrôles de domaine/fournisseur ne sont pas livrés par ce lot. Aucun push, nouvelle CI, merge, déploiement ni appel fournisseur réel n'est effectué ; le budget GitHub Actions à 0 € reste non vérifié.
