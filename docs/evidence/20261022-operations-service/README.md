# Listes Service et synthèses du planning

Code : 342e1ba2c280bcb4fb05ba22568c5c75701310be. Dans Opérations, Tickets, Interventions et Maintenance utilisaient chacun un cache de 200 lignes. Une intervention récente pouvait disparaître derrière des interventions historiques ; capacité hebdomadaire et tournées étaient alors calculées sur une liste tronquée. Le tri alphabétique des priorités plaçait NORMAL avant HIGH.

La [sonde](baseline-probe.test.ts.txt), sur 76caa3f, reproduit [huit observations en échec et un témoin positif](baseline.json). Elles proviennent de trois plafonds et du classement, pas de huit vulnérabilités indépendantes. L’adaptateur interroge l’ancienne action ; il n’exécute pas l’interface. Les tests finaux appellent directement les quatre actions corrigées.

Les [annuaires](../../../src/lib/operations/service-directory.ts) appliquent recherche, état, priorité et agence avant total et pagination par 25. Les historiques imbriqués gardent leur périmètre. Les tickets sont classés URGENT, HIGH, NORMAL, LOW, puis valeurs historiques inconnues ; dates et identifiants stabilisent les égalités. Le même classement est appliqué aux six priorités de la synthèse.

Le [planning](../../../src/lib/operations/planning-summary.ts) lit les interventions par lots de 250 dans un snapshot SQL. La capacité porte sur toute la semaine civile de la société, hors annulations : minimum de 15 minutes par intervalle, 60 sans heure de fin, comme précédemment. Les 14 premiers jours à venir contenant du travail gardent six aperçus chacun, avec totaux et conflits calculés sur toutes leurs interventions. Les conflits traversent minuit et les limites d’aperçu ; un créneau commencé avant la semaine reste pris en compte. La distance est à vol d’oiseau, chronologique par intervenant ; calendriers externes et agences inaccessibles ne sont pas vérifiés.

Les lectures client distinguent chargement, échec et liste vide, avec reprise et réponses anciennes ignorées. Un total inconnu n’est pas présenté comme zéro. Le formulaire de renouvellement ouvert est conservé indépendamment de sa page, et le formulaire de planification utilise le dossier sélectionné, même hors du cache initial. Les commandes d’intervention suivent les droits courants et la démo en lecture seule. Les styles existants sont conservés.

## Qualification

La [recette](local.json) passe **3 698 tests dans 284 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les **53 cas dédiés**, deux rendus statiques de pagination et **135 cas ciblés/voisins** passent. Ils couvrent les 201 dossiers de chaque liste, pagination complète, états combinés, références étrangères, agences, droits révoqués, démo, jours de changement d’heure et conflits hors aperçu. Un oracle pair à pair indépendant vérifie le balayage des conflits.

Le cas de 10 001 créneaux renvoie six aperçus dans une réponse de 2 663 octets. La lecture observée dans la recette ciblée prend 1 894 ms : c’est une mesure SQLite locale, sans garantie de latence, de charge ou de PostgreSQL. Le traitement reste linéaire dans l’horizon parcouru ; le volume de réponse est borné.

Types, ESLint, Oxlint et build de 76 pages passent. Les 1 241 fichiers source concordent avec ce commit ; 710 versions installées correspondent au lockfile après deux normalisations de préfixe v. Les audits de l’[outillage inchangé](../20261021-test-toolchain/README.md) restent datés. Les sept contrôles générateur/PDF passent dans la suite complète ; la couverture ne concerne que les six modules configurés. Le premier typage, incompatible avec le client Prisma étendu, est conservé dans la preuve ; le type de transaction existant est désormais utilisé sans conversion forcée.

**494 cas Playwright sont sélectionnés, dont huit nouveaux desktop/mobile ; aucun parcours applicatif n’est exécuté.** Ils préparent recherche, pagination, filtres, panne/reprise, saisies conservées et commandes désactivées sans droits. Les tests SQL et deux rendus React statiques ne prouvent pas ces interactions. Sessions et cache Next sont simulés ; SQL et contrôles de droits sont réels.

## Limites et reproduction

Les caches du lecteur racine subsistent pour d’autres consommateurs et certains sélecteurs de création. Le Help Desk principal est un lecteur distinct ; les versions et l’atomicité des écritures de renouvellement restent à qualifier. Ce lot ne clôt pas tout le domaine Service. PostgreSQL, Linux, navigateur, CI distante et déploiement du même SHA restent à qualifier. Aucun schéma, paquet, licence, installation ou envoi fournisseur ne change. Aucun push, fusion ou déploiement : le plafond GitHub Actions à 0 € avec arrêt de l’usage payant reste à attester.

Dans une copie déjà installée, fournir uniquement une configuration fictive et une DATABASE_URL SQLite neuve. Préparer avec `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/operations-service-directory.integration.test.ts tests/unit/directory-pagination-view.test.ts tests/unit/operations-activity-summary.integration.test.ts tests/unit/operations-dashboard-relations.integration.test.ts tests/unit/public-demo-database.integration.test.ts tests/unit/public-demo.test.ts --no-file-parallelism`. La suite complète utilise run --coverage --no-file-parallelism, sans build parallèle.

Pour le diagnostic, copier la sonde dans une autre recette de 76caa3f sous tests/unit/operations-service-directory.integration.test.ts et lancer ce seul fichier sur une base fictive neuve. Huit échecs et un témoin positif sont attendus.
