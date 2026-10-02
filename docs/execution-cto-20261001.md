# Exécution du plan CTO — 1er et 2 octobre 2026

Ce document est le suivi courant du [plan](plan-vitrine-cto-20260930.md). Il distingue préparation et preuves exécutées. Les rapports précédents restent historiques.

| Lot | État courant | Preuve ou prochaine condition |
| --- | --- | --- |
| Référence Git et documentation | Référence locale publiée dans Git | Commit d’application `bb5504b`, documentation et correction du relevé d’empreintes ; tag publié `review-local-20261002-final` sur `04c12fc`. README, ADR, carte des preuves, contribution et guide de revue. Correspondance de 658 fichiers avec les deux copies de recette. Branche de travail poussée ; aucune release ni application hébergée |
| Node et dépendances runtime | Vérifié localement | Node 24 déclaré dans package/CI/images ; `tsx` disponible au runtime ; Next 16.3.6. Audit npm : aucune vulnérabilité connue sur le lockfile contrôlé. Inventaire de 1 039 entrées avec licences déclarées ; droits effectifs/assets à examiner |
| PostgreSQL | Réussite native et conteneur | PostgreSQL 18.3 isolé : 43 migrations, puis 456 tests réussis / 1 test propre à SQLite exclu, 105 fichiers réussis / 1 exclu. PostgreSQL Linux 18.6 : migrations et fixtures Prisma exécutées. Mise à niveau de données historiques encore à qualifier |
| SQLite et lanceur local | Réussite avec le code courant le 2 octobre | Nouvelle copie et nouvelle base fictive créées par `demo.mjs --prepare`, puis 457 tests réussis dans 106 fichiers, sans exclusion. Sauvegarde/restauration native incluse. Client Prisma SQLite du dépôt conservé |
| Qualité et couverture ciblée | Seuils locaux réussis le 2 octobre | Typage et lint réussis ; couverture V8 des six modules ciblés par la CI : statements 82,60 %, branches 58,03 %, fonctions 84,34 %, lignes 86 %. Nouvelle exécution isolée : 457 tests réussis. Il ne s’agit pas de la couverture globale de l’application |
| Parcours navigateur | Réussite répétée le 2 octobre sur serveur compilé | 19 parcours desktop sur PostgreSQL neuf, connexion normale par mot de passe sans contournement CI. Le défaut de publication JSONB et les sélecteurs/dates de recette ont été corrigés. Sources figées dans le commit `bb5504b` |
| Redis et worker | Recette locale réelle réussie | Configuration URL/TLS/identifiants et retries testés ; job BullMQ/Redis réel produisant un PDF de devis sous Linux ; arrêt worker sur SIGTERM réussi. Redis TLS hébergé et reprise après SIGKILL restent ouverts |
| Docker | Image Linux exécutée | OpenSSL 3 installé avant génération Prisma ; build limité aux entrées autorisées, sans bases/fichiers privés imbriqués. Huit contrôles : configuration vide refusée, migrations, fixtures, sondes web, arrêt web, job worker/PDF, arrêt worker, PDF hors réseau non-root |
| Ordonnanceur | Configuration préparée, non activée | Workflow désactivé par défaut ; URL et activation par variables GitHub. Aucun déclenchement distant. Le profil public interdit les processeurs |
| Profil de démo en lecture seule | Vérifications navigateur répétées le 2 octobre sur serveur compilé local | Huit contrôles desktop et neuf mobiles, aucune erreur de page ; routes sensibles refusées, commandes approuvées désactivées, consultation/recherche/PDF/déconnexion disponibles. Rôle SQL lecteur testé : sept contrôles de refus/permissions le 1er octobre. Aucun fournisseur réel qualifié |
| Récupération | Recette native réussie | 135 tables, 140 lignes, 3 fichiers et 1 archive de facture chiffrée restaurés dans une cible neuve ; hashes et déchiffrement contrôlés. Environ 4,9 s dans cette petite recette, pas un RTO hébergé |
| Charge | Budget local réussi sur la seconde mesure | 30 min, 16 696 requêtes HTTP, 10 sessions normales et 10 000 clients fictifs ; zéro erreur, p95 de 76 à 342 ms selon les huit routes. Serveur chaud sans compilation ni suite de tests simultanée. Première mesure avec 56 erreurs conservée ; pas de preuve de performance hébergée ou de rendu navigateur |
| CI distante / hébergement | Première CI exécutée ; correction des E2E | Sur `04c12fc`, PostgreSQL et image Linux réussissent, ainsi que types/lint/tests/build/couverture ; huit E2E échouent faute de fixtures de pagination et à cause d’un ancien libellé de test. Voir le suivi ci-dessous et la CI de la branche pour le résultat du correctif. Budget 0 €, aucune application hébergée |

La recette PostgreSQL se trouve dans un nouveau dossier externe `Freelio-cto-20261001-*` sous le répertoire temporaire Windows. Elle utilise des identifiants et secrets fictifs générés pour cette seule copie, des dépendances copiées et un client Prisma PostgreSQL propre à la copie. Aucun `.env` du dépôt n’est utilisé, aucun service PostgreSQL existant n’est modifié. Le cluster natif utilise les binaires installés 18.3 ; la recette conteneur utilise PostgreSQL 18.6 et Node 24.21.0. Le dépôt local conserve son client Prisma SQLite pour la démonstration locale.

Les connexions Node du runner sont bornées par le garde-fou de démonstration aux hôtes locaux et aux téléchargements publics de polices. Chromium dispose aussi de ses restrictions de rendu. Ces protections de recette ne constituent pas un pare-feu système de production.

## Identité et fichiers de preuve

Le commit de code local est `bb5504b5a3c1a4d3b6f76b2a6afbcbcb219092a7`, branche `codex/production-hardening-20260922`, issu de la base historique `e5bf1d7`. Les suites du 2 octobre ont été exécutées dans les copies isolées avant ce commit ; [verified-source.json](evidence/20261002/verified-source.json) confirme que leurs 658 fichiers d’application, tests, ressources et configurations sélectionnées correspondent au commit. Les scripts de livraison sont contrôlés séparément. Le commit de documentation suivant n’altère pas l’application. Le tag `review-local-20261002-final` conserve cette référence locale ; le correctif de CI ultérieur avance la branche sans déplacer le tag.

`node scripts/fingerprint-source.mjs` relève les fichiers suivis ou nouveaux et annonce explicitement les modifications locales éventuelles ; les secrets, bases et dépendances installées sont exclus. Les exclusions des dossiers de données `data/` et `uploads/` s’appliquent à la racine et conservent les routes source portant ces noms. Une empreinte n’atteste pas à elle seule que des tests ont été exécutés.

Image Linux finale testée : `freelio:cto-20261002-final`, identité retournée par Docker `sha256:b42acaa47726e3c321158db68655f849ff80528d00b266e67d652688ac3975d2`. Rapport `Freelio-linux-LBeUlm/verification.json`, du 2 octobre à 16:54–16:55 UTC, huit contrôles réussis. Les entrées du builder inchangées ont été réutilisées depuis le build du 1er octobre ; les scripts runtime ont été actualisés. L’horodatage du PDF le rend variable d’une exécution à l’autre ; son hash dans le rapport désigne le document de cette recette.

Les [rapports conservés dans le dépôt](evidence/20261002/README.md) permettent une revue sans dépendre des répertoires temporaires. Vitest et Playwright y sont projetés sans configuration privée, sorties ou pièces ; les hashes des originaux restent dans `receipts.json`. Les identifiants et clés de la recette ne font pas partie du dossier partageable.

Originaux externes : `evidence/unit-postgres.json`, `evidence/unit-sqlite.json`, `evidence/e2e-desktop.json`, `evidence/public-demo.json`, `evidence/public-demo-mobile.json`, `evidence/public-demo-db-role.json`, `evidence/dependency-inventory-final.json`, `Freelio-recovery-OtcpQQ/verification.json` et `evidence/load-demo.json`.

Une exécution simultanée aux builds a échoué sur deux tests de numérotation (timeouts/connexion SQL). Son rapport est conservé sous `unit-postgres-concurrent-build-failure.json`. La nouvelle suite complète passe sans modifier les délais des tests. La mesure de charge initiale est conservée sous `load-demo-concurrent-build-failure.json` ; elle n’est pas transformée en succès malgré ses p95 acceptables.

Le 2 octobre, un premier essai de couverture simultané aux E2E a échoué : le sous-processus Prisma de préparation de la recette SQLite a dépassé trente secondes. L’échec est conservé dans `coverage-concurrent-e2e-failure.json`. L’exécution seule réussit avec les mêmes délais, les 457 tests et les quatre seuils de couverture. Le code des tests et les seuils n’ont pas été assouplis.

La seconde charge s’est terminée le 1er octobre à 18:27 UTC. Les 32 relevés mémoire du processus Next vont de 17:57 à 18:28 UTC : maximum de working set 959 090 688 octets (915 Mio), maximum de mémoire privée 1 062 215 680 octets (1 013 Mio). Les valeurs montent et redescendent ; cette mesure courte ne prouve pas l’absence de fuite mémoire et ne dimensionne pas une offre d’hébergement. Elle exclut génération PDF, hydratation navigateur, réseau distant et limiteur distribué. Les 10 000 entrées concernent les clients ; les autres domaines utilisent un petit corpus fictif.

## Reproduire les contrôles de livraison

Depuis un checkout préparé avec Node 24 et Docker Desktop Linux fonctionnel :

```powershell
docker build -t freelio:local-review .
node scripts/verify-container-runtime.mjs freelio:local-review
node scripts/check-publication.mjs --history
node scripts/inventory-dependencies.mjs
node scripts/fingerprint-source.mjs
```

Le contrôle conteneur crée et retire exclusivement ses propres services nommés de manière unique, sans ports publiés, sur un réseau Docker interne. Il applique les migrations à une PostgreSQL neuve et crée les fixtures. Les sondes web utilisent des valeurs R2/Upstash fictives : elles vérifient SQL/configuration, pas la disponibilité de ces fournisseurs. Le serveur Next se termine sur SIGTERM avec son code conventionnel 143 ; le worker termine avec 0. Le script conserve un rapport même en cas d’échec.

Pour les tests natifs et E2E, utiliser une base dédiée et les commandes du README/CONTRIBUTING. Les fixtures E2E sont consommées : un nouveau run complet part d’une base neuve. Ne pas utiliser les secrets ou données du projet pour reproduire ces preuves.

## Suivi de la CI distante du 2 octobre

Le push de la branche et du tag sur `04c12fc26e07f140410fe21181de99f53153bc0f` déclenche deux exécutions : [branche](https://github.com/lacombechristophe/freelio/actions/runs/37048788057) et [tag](https://github.com/lacombechristophe/freelio/actions/runs/37048787904). Toutes deux échouent uniquement sur les mêmes huit E2E (69 réussis, 21 exclus selon leurs conditions). Ce résultat ne remplace pas les preuves locales par un succès global.

Trois parcours, chacun exécuté sur desktop et mobile, cherchent les clients/contacts `ZZZ Recette` absents du seed de base. La CI prépare désormais le corpus de pagination après les tests unitaires et la couverture, dans sa SQLite dédiée `file:./e2e-ci.db`. Le script exige les trois marqueurs `CI=true`, `RECIPE_ISOLATED=true` et `E2E_DIRECTORY_FIXTURES=true` pour cette base. Cette préparation active aussi le parcours de pagination auparavant exclu en CI. Les deux autres échecs viennent du sélecteur historique « Workflows » : le test recherche désormais le libellé existant « Scénarios ». Aucun écran, délai, seuil de couverture ou assertion métier n’est assoupli.

La reproduction locale ciblée révèle également une injection réseau intermittente sur mobile : le service worker peut contourner `page.route`. Il est bloqué uniquement dans le contexte du scénario qui injecte une erreur de lecture ; les autres parcours, notamment hors ligne, conservent la configuration habituelle. Les assertions vérifient toujours l’erreur, la recherche conservée puis la réussite après réessai.

Après correction, dix parcours ciblés réussissent sur le serveur compilé SQLite neuf : les huit auparavant en échec et les deux parcours de pagination activés. Connexion normale par mot de passe, cinq parcours desktop et cinq mobiles, aucun retry de test. Build, lint des fichiers modifiés et contrôle de publication/historique réussissent également. Ce résultat ciblé local ne vaut pas une réussite de la suite distante complète.

Le [run du correctif `c08d6e7`](https://github.com/lacombechristophe/freelio/actions/runs/37054059956) confirme ces dix réussites, mais se termine avec 77 E2E réussis, deux échecs et 19 exclusions de viewport prévues. Le parcours SAV cherche son client directement sur la première page du portefeuille ; le corpus de volumes déplace ce client. Cette interruption empêche aussi la préparation des changements de santé attendus par le parcours d’automatisation ultérieur. Le test SAV utilise désormais la recherche du portefeuille, sur desktop et mobile. La reproduction locale des deux scénarios dans leur ordre réussit : trois parcours réussis, une exclusion mobile prévue pour l’automatisation, connexion normale et délais conservés.

Les preuves SQLite et PostgreSQL du run sont téléchargées et contrôlées ; les six modules de couverture conservent leurs seuils. Le job Linux réussit ses huit contrôles, mais son artefact ne contient initialement que les identités Git/image : le rapport était créé dans `/tmp`, tandis que la collecte cherchait dans `${runner.temp}`. La recette Linux reçoit désormais `TMPDIR=${runner.temp}` et son rapport est collecté même en cas d’échec. Vérifier la présence de `verification.json` dans l’artefact du nouveau SHA, en plus du résultat des trois jobs.

Le résultat faisant foi est celui du SHA de la branche dans [Vérification CRM](https://github.com/lacombechristophe/freelio/actions/workflows/ci.yml?query=branch%3Acodex%2Fproduction-hardening-20260922). Vérifier les trois jobs et leurs artefacts associés au commit ; le tag local publié reste une preuve historique distincte. Les traces de navigateur utilisent des données fictives mais peuvent contenir des sessions de recette ; elles ne sont pas copiées dans le dossier de revue.

## Travail encore nécessaire

La présentation privée peut s’appuyer sur les commits, les rapports conservés et le guide de revue ; annoncer leur périmètre et leurs limites. Les modifications de présentation déjà présentes ont été conservées, sans nouveau changement de couleur ou de disposition dans cette finalisation. Pour la référence de revue publiée : vérifier la réussite de la CI distante sur le SHA candidat et examiner licences/assets. Avant hébergement : qualifier le runtime public, le reverse proxy, le limiteur distribué, R2, les quotas PDF/logs, les ressources et la récupération distante. Le budget de 0 € exclut tout abonnement non approuvé.

Avant usage commercial : décision de maintenance Prisma/Auth.js, migrations depuis des données représentatives de la version précédente, récupération des factures historiques sans snapshot, lease générique renouvelé pour tâches longues, reprise des jobs après arrêt brutal, équivalence des droits sur toutes les entrées, fournisseurs et cadre juridique réel. Aucun résultat actuel n’est une certification Factur-X, un audit de sécurité exhaustif ou une preuve de conformité SaaS.
