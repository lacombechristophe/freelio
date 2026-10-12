# Intégrité des écritures Temps

Le [diagnostic](before.json) et son [reproducteur](reproducer.test.ts.txt) constatent sept écritures invalides sur les actions antérieures : durées négatives, relations vers un client étranger et modification/suppression d'un temps facturé. Les dix cas passent en reproduisant ces défauts, deux plafonds de lecture et un contrôle positif. Ils ne constituent pas une qualification de la correction.

Le [contrat approuvé](../../contrat-temps-integrite.md) porte sur les trois mutations Temps et leurs notifications existantes. Le test `time-entry-integrity.integration.test.ts` utilise les vraies adhésions, les vrais scopes et des transactions SQL. L'authentification et le cache Next sont simulés ; un proxy injecte une panne de budget sans remplacer les écritures SQL. Une barrière de deux lectures réelles force l'entrelacement sur PostgreSQL ; SQLite exécute ces deux créations successivement et ne constitue pas une preuve de concurrence.

Les 46 cas couvrent refus avant transaction, validation, sociétés/agences, factures brouillons, rollback, parcours cohérents et budget persistant. Huit E2E séparés vérifient les notifications compilées et la conservation de la saisie ou du chronomètre. Leur chargement avec `--list` ne vaut pas exécution.

La qualification locale et distante doit identifier son commit, ses commandes et ses limites. La création de temps depuis Organisation, la facturation des temps concurrents et les lecteurs plafonnés restent des parcours distincts. Une révocation pendant une transaction déjà autorisée et la contention multi-processus ne sont pas qualifiées par ces tests.

La première vérification locale a été arrêtée par Oxlint : la variable du module Prisma de test s'appelait `module`, nom interdit par la règle Next. Elle a été renommée ; aucune règle ni aucun test n'a été désactivé.

La [CI branche de `bcb7577`](https://github.com/lacombechristophe/freelio/actions/runs/38300299450) exécute 333 E2E réussis et 19 exclusions historiques ; deux E2E d'édition échouent sur une ligne rendue inaccessible aux lecteurs de rôle pendant l'ouverture du dialogue. La notification de refus et les saisies conservées passent avant cette assertion. Le test vérifie maintenant la durée d'origine après fermeture et rechargement, avec les mêmes contrôles de refus et de saisie. Aucun code applicatif n'est modifié par cette correction du test.
