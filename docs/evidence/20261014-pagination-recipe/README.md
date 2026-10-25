# Recette de pagination sur SQLite

Les deux CI de 2f21a5d passent le typage corrigé et le lint, puis échouent sur les mêmes tests existants Dépenses et Communications. [Résultat conservé](ci-failures.json) : 2 344 cas SQLite réussis et deux délais de 5 secondes dépassés. Les 59 nouveaux cas Achat passent ; les parcours navigateur ne sont pas exécutés. PostgreSQL réussit 2 345 cas avec une exclusion native SQLite dans chaque run. Linux et les deux audits passent également.

Le rejeu isolé des 30 cas Dépenses/Communications passe avant modification. Les deux tests de complétude ouvraient trois transactions de lecture simultanément avec Promise.all. L'inspection SQL réelle du même moteur Prisma confirme BEGIN IMMEDIATE puis COMMIT pour chacune ; SQLite sérialise ces transactions. Cela introduit une attente entre les lectures dans une recette avec un délai de test fixe. Le diagnostic ne prouve pas que cette attente explique à elle seule toute variation de durée d'un runner.

Les deux tests lisent désormais leurs pages successivement. Les trois pages, limites 51/126, identifiants uniques, dernière référence, cartes complètes, confidentialité des boîtes et contrôle de société restent vérifiés par les mêmes assertions. Aucun délai, filtre de tests, seuil de couverture, audit ni comportement applicatif n'est modifié. Ces cas qualifient la complétude d'une pagination ; ils ne sont pas présentés comme des essais de charge ou de concurrence réseau.

Les [rapports CI complets](../20261013-candidate/ci-2f21a5d.json), l'[identité du merge testé](../20261013-candidate/source-2f21a5d.json) et la [lecture hébergée](../20261013-candidate/hosted-2f21a5d.json) restent conservés. La preview passe 49 pages/onglets par surface sans erreur JavaScript, retry ou exclusion ; ce passage en lecture seule ne transforme pas la CI rouge en qualification globale. La suite locale complète avec couverture et les CI du correctif doivent passer séparément.

## Passage local complet conservé

Le [passage avec couverture](local-coverage.json) réussit les 2 305 cas exécutés et les deux suites de pagination, mais reste globalement en échec : le hook de politique de lint dépasse 30 secondes et ses 41 cas sont non exécutés. Ce résultat ne vaut pas une couverture locale entièrement verte. Le rejeu de cette suite est effectué séparément, sans modification de son délai ; la CI du correctif conserve tous les contrôles.

Le [rejeu isolé de politique de lint](lint-policy-replay.json) passe ses 41 cas sans délai modifié. Le passage complet initial reste conservé en échec ; seuls les contrôles CI exacts du nouveau commit peuvent établir sa qualification complète.
