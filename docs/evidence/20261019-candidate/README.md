# Candidat 8d22323

Les [deux CI complètes](ci-8d22323.json) terminent tous leurs contrôles fonctionnels : 2 440 tests SQLite dans 224 fichiers par job UI, 2 439 PostgreSQL et une exclusion native SQLite, neuf contrôles Linux. Chaque exécution termine 217 parcours ordinateur et 200 mobiles, sans échec, avec respectivement une et dix-huit exclusions historiques. Types, les deux lints, build, couverture ciblée et les deux audits de chaque job UI passent ; les audits signalent zéro vulnérabilité.

L'archive historique et les nouvelles fiches Service/Achat passent dans les quatre jobs navigateur. Les résultats [précédents](../20261015-candidate/README.md), y compris leurs échecs, restent conservés.

Les workflows restent rouges : les uploads de preuves sont refusés pour quota GitHub. L'API des artefacts indique zéro archive pour chacun de ces deux runs. Le relevé CI conserve les comptes natifs du reporter et les digests des logs, sans reconstruire les JSON absents. La liste détaillée des exclusions n'est pas fournie par ce reporter. Les logs contiennent aussi des interruptions de flux serveur ; la réussite des assertions ne constitue pas une attestation de logs exempts d'erreur.

L'[identité Git](source-8d22323.json) compare 1 079 entrées hors documentation au merge PR réellement testé. La [preview exacte](hosted-8d22323.json) passe 49 visites par surface, sans erreur JavaScript, retry ou exclusion, avec harnais et alias vérifiés après consultation. Elle utilise un compte fictif Owner en lecture seule, sans stockage persistant. Ces lectures ne qualifient pas les mutations, les fournisseurs réels ou la charge.

Le complément local de changements d'état d'intervention est postérieur à ce candidat. Ses [preuves SQLite](../20261019-operations-details/full-sqlite.json) restent séparées ; les résultats de 8d22323 ne le qualifient pas sur PostgreSQL ou navigateur.
