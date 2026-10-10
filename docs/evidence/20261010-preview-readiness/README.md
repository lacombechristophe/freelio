# Préparation de la preview — 10 octobre 2026

La CI de `369f413` est verte, mais sa [sonde hébergée](baseline-http.json) répond HTTP 503 : base accessible par `SELECT 1`, configuration incomplète. Le GET utilise l’accès d’automatisation Vercel déjà existant. Une redirection vers la connexion Vercel ne serait pas une réponse de l’application. Aucun parcours de connexion ou métier n’est qualifié ici.

Le [contrôle SQL initial](database-before.json) trouve 43 migrations sur les 60 attendues dans la base de démo publique, avec un rôle lecteur. La base générale de preview est différente : 41 migrations, droits d’écriture étendus. Ces deux bases sont conservées ; aucune mise à niveau implicite n’y est exécutée.

Une [nouvelle base dédiée](provision.json), sur le service PostgreSQL existant, reçoit les 60 migrations versionnées et le seed fictif : six clients et un compte de démonstration. Le rôle web est séparé du rôle de migration. Les [huit contrôles lecteur](reader.json) vérifient une lecture, six refus SQL et les privilèges : aucune écriture métier ni création de table, uniquement SELECT et INSERT sur AuditLog. Chaque tentative SQL est annulée ou refusée ; aucun événement d’audit n’est ajouté par ce contrôle.

Les [paramètres de branche](environment.json) sont appliqués à Preview / `codex/functional-completeness-20261003` uniquement : nouvelle connexion SQL lecteur, secrets dédiés, URL de branche et trois flags de démo en lecture seule. Les valeurs restent hors dépôt. Ils prendront effet lors d’un nouveau build ; ils ne modifient pas rétroactivement le déploiement testé, ni la production.

## Condition de reprise

Lors du contrôle initial, les comptes R2 et Upstash ne sont pas encore créés. Le rapport d’environnement conserve les six paramètres alors manquants. Le propriétaire crée ensuite Upstash et refuse R2 pour respecter son budget de 0 €. Les deux paramètres Upstash sont désormais présents sur cette seule branche de preview ; leur présence ne vaut pas encore test fournisseur. Aucune valeur fictive n’est ajoutée pour faire passer la sonde.

Le [profil sans stockage](../../qualification-demo-sans-stockage-20261010.md) permet une démo publique en lecture seule avec les deux drivers à `disabled`. Il refuse tout accès persistant et tout transfert signé, sans repli sur le disque temporaire de Vercel. Le seed ne contient ni pièce jointe ni archive émise. Les PDF de brouillons restent calculés à la demande. La production modifiable conserve son exigence R2. Reconstruire ce profil, puis vérifier sonde, restrictions, connexion, listes et PDF avant présentation.

La présence de paramètres ou un HTTP 200 historique ne prouve ni l’existence ni la disponibilité des services correspondants. La [qualification historique](../../livraison-demo-vercel-20261003.md) reste attachée à son ancien code et à ses limites explicites sur R2/Upstash.

Upstash annonce un [plan Free](https://upstash.com/pricing/redis) de 256 Mo et 500 000 commandes par mois sans carte bancaire. R2 Standard annonce [10 Go et des quotas d’opérations inclus](https://developers.cloudflare.com/r2/pricing/), avec facturation des dépassements et [activation par souscription](https://developers.cloudflare.com/r2/get-started/). Tarifs consultés le 10 octobre ; le compte Upstash est créé par le propriétaire, sans souscription R2. Le budget de 0 € reste la contrainte, sans garantie de gratuité permanente des services hébergés.

## Reproduire

Utiliser un rôle de migration uniquement sur une base neuve explicitement désignée, appliquer les migrations du commit et `scripts/seed-demo.mjs` avec `DEMO_DATABASE_NAME` concordant. Créer un rôle lecteur propre à cette base, sans droits de création ou d’administration, puis contrôler ses privilèges et les refus métier dans des transactions annulées. Les scripts locaux de provisionnement du dépôt gardent leur restriction localhost ; cette préparation distante ne l’assouplit pas. Ne pas importer de données réelles, secrets ou fichiers d’environnement dans une copie de recette.

Le [rejeu hébergé de 92a07a3](hosted-92a07a3.json) vérifie ensuite les sondes HTTP 200, la connexion, les lectures et les deux PDF sans R2. Les parcours ordinateur et mobile restent en échec à cause de trois erreurs d’hydratation React chacun. Le [diagnostic de dates](date-timezone.json) et le [compte rendu](../../qualification-demo-sans-stockage-20261010.md) décrivent ce défaut historique.

Après autorisation, `bc8f2d6` fixe le fuseau UTC des trois listes. Le [rejeu de ce candidat](hosted-bc8f2d6.json) réussit sur ordinateur en UTC+14 et mobile en UTC−8, sans erreur React. La CI complète de [6156c83](ci-6156c83.json) qualifie le profil sans stockage précédent ; la CI de la correction des dates reste distincte.

Ces résultats ne qualifient pas R2, la charge distribuée Upstash, une restauration distante ou un déploiement futur.

La revue élargie de `960b8b6` conserve [une erreur React dans Planning](hosted-modules-960b8b6.json). Le [complément local](service-calendar-complement-local.json) corrige les tournées, la capacité hebdomadaire et les minuits sautés/répétés ; 1 657 tests, types, lints et build passent. Sa qualification navigateur doit être attachée au nouveau candidat. Un [diagnostic Organisation distinct](organisation-domain-before.json) reproduit six divulgations de documents sans droits de domaine ; sa correction visible attend l'accord du propriétaire.
