# Chargement transactionnel de Communications sur SQLite

Les [deux CI de faeb7b3](ci-faeb7b3.json) passent types, lint, couverture et build, les 2 350 cas SQLite et les 2 349 PostgreSQL avec une exclusion native SQLite. Le build transmet désormais son budget au compilateur. Docker échoue séparément sur la copie manquante du préchargement ; ce défaut est [conservé et corrigé](../20261014-build-memory/container-preload.json).

Les parcours navigateur démarrent, puis le premier GET Communications reçoit P1008. Quinze cas desktop passent, neuf échouent et le job est interrompu à 45 minutes. Les quatre parcours Achat ne sont pas terminés. Ces logs ne constituent pas un rapport navigateur complet ; les artefacts détaillés ne sont pas disponibles à cause du quota. Les deux audits passent sans vulnérabilité.

Le tableau de bord lance ensemble les lecteurs Inbox et Destinataires, chacun ouvrant une transaction interactive. L'observation SQL précédente du même connecteur Prisma 6.12 montre BEGIN IMMEDIATE. Ce mode réserve l'écriture, dont SQLite ne permet qu'une instance simultanée ([SQLite](https://www.sqlite.org/lang_transaction.html)). Le chevauchement constitue donc un risque de contention ; le relier définitivement au blocage compilé exige le passage de la nouvelle CI.

La [comparaison locale](local-before-after.json) utilise le vrai getter, les lecteurs et Prisma, avec session/cache simulés. Trois contrôles de données/droits passent avant correction ; un contrôle observe deux appels de lecteurs en cours, au lieu d'un. Ce compteur mesure leurs fenêtres d'exécution, pas deux verrous SQLite acquis simultanément. Après correction, Inbox termine avant le démarrage de Destinataires sur SQLite. PostgreSQL conserve le lancement parallèle. Les douze contrôles ciblés passent : données propres à la société, signature, indicateurs, refus de domaine et absence d'écriture en démo.

Les champs, DTO, filtres, règles d'accès, délais des transactions et tests restent identiques. Aucun envoi ni serveur local. Le build compilé et le parallélisme PostgreSQL du correctif restent à qualifier ; ce changement ne constitue pas une preuve de charge ou de sérialisation globale entre requêtes.

La [preview exacte de faeb7b3](hosted-faeb7b3.json) passe 49 visites par surface sans erreur JavaScript, retry ou exclusion. Le [code testé par la PR](source-faeb7b3.json) correspond aux 1 067 entrées hors docs. Cette lecture PostgreSQL hébergée ne prouve ni le chemin SQLite ni les mutations.
