# Qualification du candidat Freelio

État du 20 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le dernier candidat local, `1dd29efceb0a0799ecc847053b4521c8dc7c0315`, passe **2 885 tests SQLite dans 248 fichiers**, sans échec ni exclusion, ainsi que types, deux lints et build. Il corrige les [conversations natives et leurs réparations](evidence/20261020-native-conversations/README.md) ; migration historique et identité de ses 1 147 fichiers source vérifiées. Deux [défauts de sélection des boîtes à synchroniser](evidence/20261020-sync-fairness/README.md) sont ensuite reproduits séparément et restent ouverts. Ce candidat n'est pas poussé ; PostgreSQL et navigateur restent à qualifier, et le plafond GitHub Actions à 0 € reste non vérifiable avec l'accès disponible.

Le dernier résultat distant complet concerne `8d2232385f8cfcca9006d5e56ecdb3794485610c`. Tous les contrôles fonctionnels passent dans les deux workflows, dont l'archive historique et les quatre fiches Service/Achat. La CI reste rouge uniquement sur les uploads refusés par GitHub pour quota. Les compléments locaux d'intervention et de gestion des dépôts passent ensuite [2 501 tests SQLite dans 228 fichiers](evidence/20261019-warehouses/README.md), sur une base neuve, ainsi que types, deux lints et build sur `3836dc4`. PostgreSQL et navigateur de ces compléments restent à qualifier.

Le lecteur des annuaires Sites et parc est corrigé ensuite dans `cd0f965` : [109 cas ciblés, types, deux lints et build réussis](evidence/20261019-asset-directories/README.md). Les sept défauts reproduits concernent les relations étrangères et les compteurs, y compris pendant une recherche. La suite complète précédente ne qualifie pas ce commit ultérieur ; son parcours navigateur est préparé, pas exécuté.

Le cycle d’édition et de désactivation des Sites et équipements passe ensuite [2 635 tests SQLite dans 234 fichiers](evidence/20261020-asset-lifecycle/README.md) sur `4463f67`, avec types, deux lints, build et évolution d’une base fictive déjà remplie réussis. Les 124 cas dédiés couvrent aussi imports, renouvellements et choix complets. PostgreSQL et navigateur du lot restent à qualifier ; le transfert entre agences est traité séparément.

Le [transfert complet d’un site](transfert-dossier-site.md), choisi avec audit, est implémenté dans `ae1b02f`. Ses [28 cas dédiés et 163 avec les voisins](evidence/20261020-site-transfers/README.md) passent, puis la suite complète termine **2 664 cas dans 235 fichiers**, sans échec ni exclusion. Types, deux lints et build passent. Ces résultats locaux ne qualifient pas encore PostgreSQL, les 446 cas navigateur sélectionnés ni une nouvelle livraison distante.

La [réservation CRM du portail](evidence/20261020-portal-bookings/README.md) est ensuite implémentée dans `73b299d`, avec contrôle commun de capacité des membres et interventions, version, audit, annulation et conservation des historiques. La suite finale passe **2 729 tests dans 240 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Types, deux lints, build et évolution des demandes historiques passent ; 1 122 fichiers source correspondent au commit. PostgreSQL et parcours navigateur restent à qualifier, et aucun nouveau push n’est effectué.

Les [observations Gmail/Outlook et pièces entrantes](evidence/20261020-mail-observations/README.md) sont implémentées dans `d02c701`, puis protégées contre les reconnexions intercalées dans `8a7f9a6`. La suite finale passe **2 817 tests dans 246 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Types, deux lints, build de 76 pages statiques et évolution des messages historiques passent ; les 1 140 fichiers source correspondent au commit. Les 448 cas navigateur sont sélectionnés, pas exécutés. PostgreSQL réel, comptes OAuth réels et nouvelle livraison distante restent à qualifier ; aucune nouvelle CI n'est déclenchée sans vérification du plafond de dépenses à 0 €.

`194066c` aligne ensuite les [commandes Communications sur les rôles](evidence/20261020-communications-access/README.md) et corrige le plantage d'une boîte vide. Les 64 contrôles ciblés puis **2 829 tests complets dans 246 fichiers** passent sur une nouvelle SQLite fictive, sans échec ni exclusion. Types, deux lints, build de 76 pages statiques et audits npm complet/production passent ; les audits ne signalent aucune vulnérabilité à cette date. Les 1 142 fichiers source correspondent au commit. Le complément de recette `d606c09` ajoute uniquement le retour à la liste avant recherche sur mobile ; ses 454 cas navigateur sont sélectionnés, pas exécutés. Les effets de navigateur ne sont pas présentés comme exécutés par les tests SSR.

`1194b51` corrige ensuite la [progression des fenêtres calendrier](evidence/20261020-calendar-window/README.md) et les reconnexions intercalées. Ses **2 858 tests dans 247 fichiers** passent sur une SQLite neuve, sans échec ni exclusion, avec types, deux lints et build réussis. Les 1 143 fichiers source correspondent au commit ; aucun schéma SQL ne change. L'audit de clôture reproduit toutefois [deux défauts de conversations entrantes](evidence/20261020-native-conversations/README.md), hors de cette suite : MAIL-05 reste ouvert sur leur identité native. Ces résultats n'autorisent pas à annoncer tous les P1 terminés.

| Contrôle | CI branche | CI PR |
| --- | --- | --- |
| Types, ESLint, Oxlint, couverture et build | Réussis | Réussis |
| SQLite | 2 440 cas / 224 fichiers réussis dans chacun des deux jobs UI | 2 440 cas / 224 fichiers réussis dans chacun des deux jobs UI |
| PostgreSQL | 2 439 réussis, une exclusion native SQLite | 2 439 réussis, une exclusion native SQLite |
| Image Linux et runtime | Neuf contrôles réussis | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité dans les deux audits de chaque job UI | Zéro vulnérabilité dans les deux audits de chaque job UI |
| Navigateur compilé | Ordinateur : 217 réussis / une exclusion ; mobile : 200 réussis / 18 exclusions ; aucun échec | Ordinateur : 217 réussis / une exclusion ; mobile : 200 réussis / 18 exclusions ; aucun échec |
| Rapports détaillés téléversés | Refusés : quota GitHub | Refusés : quota GitHub |

Les [résultats et digests des logs](evidence/20261019-candidate/ci-8d22323.json) distinguent ces états. Les runs [branche](https://github.com/lacombechristophe/freelio/actions/runs/39263465902) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/39263471846) restent rouges. Les uploads refusés ne sont pas transformés en succès par les seuls tests réussis. Les [échecs précédents](evidence/20261015-candidate/README.md) restent conservés.

Les 59 nouveaux contrôles SQL Achat et les quatre parcours Achat ordinateur/mobile passent dans les deux runs. Les contrôles de Communications et de sérialisation SQLite passent aussi sur PostgreSQL réel. Le Portail passe dans les deux jobs ordinateur ; le premier échec de a01ce4c reste conservé sans cause attribuée. Ces passages ne constituent pas une mesure de charge.

La [preview exacte](evidence/20261019-candidate/hosted-8d22323.json) passe 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ni exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. L'[identité du code](evidence/20261019-candidate/source-8d22323.json) compare 1 079 entrées Git hors `docs/` au merge PR réellement testé `2bdd1b29e74efed5b1bbd576aad2b68b1ebb6a9e`. Harnais et alias ont été vérifiés après la visite. Cette consultation ne prouve pas les mutations ni les comptes fournisseurs.

## Corrections récentes

| Invariant | Correction et preuves |
| --- | --- |
| Un produit ou chantier ancien reste sélectionnable sans effacer le formulaire | [Choix Achat](evidence/20261014-purchase-choices/README.md) : recherche et pages de 25, choix séparément vérifié, identité stable des lignes, prix personnels conservés ; 35 cas SQL et deux E2E. |
| Une création d'achat refuse les références devenues invalides | [Création Achat](evidence/20261014-purchase-creation-integrity/README.md) : chantier/client/agence et produits actifs relus dans la transaction ; aucun brouillon, ligne ni audit après refus ; 24 cas SQL et deux E2E. |
| Les lectures interactives SQLite ne se bloquent pas entre actions | [Transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) : file par processus, budget maxWait conservé, appel expiré jamais exécuté, contexte de chaque demandeur conservé ; PostgreSQL et transactions par tableau inchangés. |
| Le compilateur enfant reçoit le budget du build | [Mémoire et image](evidence/20261014-build-memory/README.md) : transmission explicite au CLI TypeScript de Next ; préchargement inclus dans le builder Docker. |
| La recette fournisseur distingue chaque recherche | [Historiques fournisseur](evidence/20261014-supplier-history-recipe/README.md) : attentes métier identiques dans trois cas indépendants, sans modification du lecteur ni de son délai. |
| Une facture historique sans archive ne charge pas une erreur JSON comme PDF | [Lot approuvé](contrat-factures-historiques-apercu.md) et [preuves locales](evidence/20261015-historical-invoice-preview/README.md) : indisponibilité explicite, accès PDF désactivés, aucun rendu régénéré ; parcours réussi sur les deux surfaces dans les deux CI de 8d22323. |
| La synthèse Opérations n'inclut pas une référence étrangère dans ses listes ou compteurs | [Lot approuvé](contrat-operations-dashboard-relations.md) et [preuves](evidence/20261015-operations-dashboard/README.md) : treize exclusions initialement manquantes ; 37 cas dédiés et 121 avec les suites voisines passent sur SQLite. Les 37 cas PostgreSQL et les deux parcours compilés passent dans les deux CI de 8aab95f. |
| Les fiches Équipement, Intervention, Ticket et Achat ne restituent pas leurs relations étrangères | [Portée et reproduction](contrat-operations-details-relations.md), [preuves](evidence/20261019-operations-details/README.md) : sept échecs sur douze cas avant correction ; 42 contrôles dédiés et 190 avec les voisins réussis localement. Les 42 PostgreSQL et les deux parcours compilés passent dans les deux CI de 8d22323. |
| Une intervention ou réserve inaccessible ne peut plus changer d'état par appel direct | `639f231` : relation contrôlée dans la lecture et la mise à jour ; [seize cas dédiés, 206 avec les voisins](evidence/20261019-operations-details/intervention-state.json) réussis localement. Double appel sans double audit, droits et démo vérifiés ; nouvelle CI encore requise. |

Les intercalages SQL Achat prouvent la relecture après préparation du numéro. Ils ne constituent pas un stress concurrent sur plusieurs connexions. Les prix, libellés, lignes libres et changements légitimes restent conservés. Aucun fournisseur réel n'est appelé.

## Qualification à poursuivre

Les contrôles fonctionnels et les quatre jobs navigateur de `8d22323` passent. Les uploads restent refusés : cette limite externe empêche la qualification entière de la CI. `639f231` protège ensuite les écritures d'intervention ; il n'est pas encore poussé. Ses [2 456 tests SQLite et six fichiers de couverture ciblée](evidence/20261019-operations-details/full-sqlite.json) passent sur une base neuve avec identité des sources contrôlée. Le plafond GitHub de 0 € doit être vérifié avant toute nouvelle CI. Les paragraphes suivants restent l'historique de qualification, et leurs attentes sont désormais résolues pour 8d22323 seulement.

Les deux workflows complets de `8aab95f` confirment les corrections de période Campagnes, d'ouverture du menu de suppression et de préparation PostgreSQL du transfert. Leur seul échec navigateur restant concerne `summary`, ambigu entre la vérification du document et les réglages de présentation. `93a906e` cible le second panneau explicitement et en vérifie l'unicité. Les assertions de verrouillage, refus PDF et absence de mutation restent conservées. Les paragraphes suivants décrivent les reproductions précédentes ; leurs résultats ne sont pas remplacés rétroactivement.

`3d79096` protège ensuite les quatre lecteurs Service/Achat approuvés. Les [preuves locales](evidence/20261019-operations-details/README.md) distinguent la reproduction, le passage de fixture incomplet, les 190 contrôles réussis et les 436 cas navigateur sélectionnés. La nouvelle CI doit exécuter PostgreSQL et les deux surfaces ; aucun résultat de sélection n'est présenté comme une réussite navigateur.

Les deux échecs mobiles de 1fcb8a5 sont désormais diagnostiqués. Un compteur Fournisseur était recherché dans toute la fenêtre Produit, où le choix Produit parent affiche aussi « 1 résultat ». L'audit général choisissait la première facture découverte et dépendait des documents créés sur ordinateur ; la base mobile neuve proposait une facture SENT sans archive. `53d47f2` limite le compteur à son champ et réserve un brouillon fictif vérifié pour la route représentative. Tous les contrôles console/HTTP restent actifs et le rapport annonce le choix de sa fixture.

Le défaut produit de facture historique est traité séparément dans `c578bdf` : le nouveau test SSR échoue avant correction, puis les 39 contrôles ciblés passent avec types, lint et build local de 75 pages statiques. Sur a39e5a5, ses deux E2E s'arrêtent avant l'interface : la facture bancaire réutilisée est devenue OVERDUE au lieu du SENT attendu. `eb90c50` fournit deux fixtures réservées, figées et sans archive, dont l'échéance est en 2100. Les assertions SENT, absence de PDF, refus 409 et absence de mutation restent conservées ; une fixture de recette ne constitue pas l'émission d'un document.

`6a4cf3d` remplace les accès directs ECR des images Node et du service PostgreSQL par leurs [manifestes officiels identiques et épinglés](evidence/20261015-container-registries/README.md). Aucun moteur ni contrôle Linux n'est retiré. Les neuf contrôles passent ensuite dans les deux CI de a39e5a5.

Le parcours Campagnes utilisait une fin fixe au 15 octobre 2026, déjà atteinte lors du run : l'activation est refusée par la règle existante. `94cb4c6` fournit une fenêtre relative au jour du test, avec les mêmes contrôles d'audience et d'inscription. Un troisième échec existe uniquement sur le desktop PR : le menu Supprimer ne s'ouvre pas avant l'expiration du test de libération des temps. Le harnais attend désormais l'hydratation et vérifie explicitement `aria-expanded` après chaque ouverture. Sans trace téléversée, la cause initiale n'est pas attribuée au produit ou au réseau ; le résultat de cette correction de recette reste à confirmer.

`625d66b` applique la protection Opérations approuvée. Ses [preuves locales](evidence/20261015-operations-dashboard/local.json) comprennent les contrôles positifs, relations optionnelles, historiques et agences. Types, lint et build de 75 pages statiques passent. Le [contrôle de sélection](evidence/20261015-operations-dashboard/browser-selection.json) compte désormais 434 cas, 217 par surface ; il ne les exécute pas.

Les délais existants restent conservés : 240 secondes par défaut, 15 minutes pour l'audit UI et 45 minutes par job. Les seuils de couverture et audits sont inchangés. La nouvelle CI doit qualifier ce code ; les [résultats antérieurs de a01ce4c](evidence/20261014-candidate/ci-a01ce4c.json) et les [contrôles du reporter](evidence/20261014-candidate/reporter-probe.json) restent datés.

Le [nettoyage distant autorisé](evidence/20261015-ci-storage/README.md) a traité les 269 identifiants sauvegardés : 256 supprimés, 13 déjà absents. Les 269 ZIP locaux et les 750 autres artefacts sont conservés et vérifiés. Le recalcul du quota n'est pas prouvé par cette suppression ; les uploads du candidat a39e5a5 restent refusés.

Le stockage durable, les comptes OAuth/transport réels, la délivrabilité, la charge, la reprise après arrêt brutal et la récupération distante restent à qualifier avant un usage commercial. Le budget courant est de 0 € et aucun abonnement R2 n'est engagé.

## Dernière référence entièrement qualifiée

`2b05e5f6d425542971285f13170fbcb44bb6f1bb` complète le Stock. Ses deux CI passent entièrement : 2 287 SQLite, 2 286 PostgreSQL avec une exclusion native SQLite, 407 parcours navigateur avec 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité par run. Sa lecture hébergée passe 49 visites par surface. Les [preuves CI](evidence/20261013-candidate/ci-2b05e5f.json), l'[identité](evidence/20261013-candidate/source-2b05e5f.json) et la [lecture hébergée](evidence/20261013-candidate/hosted-2b05e5f.json) restent datées ; elles ne qualifient pas les évolutions suivantes.

## Écarts fonctionnels encore ouverts

Les corrections d'intégrité et les listes complètes ne suffisent pas à clore le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md). Les points suivants restent distincts des résultats CI :

| Point | Comportement actuel et prochaine condition |
| --- | --- |
| MAIL-02 : état et pièces des messages entrants | Le [lot](contrat-etats-messageries-entrantes.md) est implémenté dans `d02c701` et `8a7f9a6` : history/delta, observation séparée du suivi CRM, copies conservées, reprise sans réception rejouée et pièces PDF/PNG/JPEG bornées avec ACL revérifiées. Les [preuves locales](evidence/20261020-mail-observations/README.md) couvrent aussi les reconnexions intercalées. PostgreSQL, navigateur et comptes réels restent à qualifier ; import historique exhaustif, archivage durable et analyse antivirus ne sont pas livrés. |
| MAIL-05 : identité native des fils entrants | [Implémentée et qualifiée localement sur `1dd29ef`](evidence/20261020-native-conversations/README.md) : séparation native, préparation/acceptation et réparations, contrainte par société/boîte, anciens fils non réaffectés. Les diagnostics initiaux restent conservés. PostgreSQL, navigateur et comptes fournisseurs réels restent distincts. |
| OPS-03 : progression des boîtes à synchroniser | [Deux échecs reproduits](evidence/20261020-sync-fairness/README.md) : des connexions calendrier seul ou des premières boîtes en échec monopolisent les lots triés sur le dernier succès mail. Une tentative distincte du succès, un tri historique explicite et une progression bornée restent à implémenter et qualifier. |
| CAL-01 : progression de la fenêtre calendrier | [Implémentée dans `1194b51`](evidence/20261020-calendar-window/README.md) : fenêtre associée au checkpoint chiffré, renouvellement paginé, anciennes copies conservées, transactions et génération de connexion. SQL/HTTP simulé qualifiés localement ; PostgreSQL et comptes réels distincts. |
| CRM-01 : cycle de vie des référentiels | Fournisseurs dispose d'édition/désactivation qualifiées. Les [dépôts](gestion-depots.md), [sites et équipements](gestion-sites-equipements.md) disposent de leurs parcours locaux d’édition et d’activité, avec protections transactionnelles et historiques conservés. Le [transfert complet d’agence avec audit](transfert-dossier-site.md) est implémenté. La [suite complète de 2 664 cas](evidence/20261020-site-transfers/README.md) passe sur `ae1b02f` ; qualification PostgreSQL et navigateur des nouveaux parcours encore requise. |
| PORTAL-01 : demande et réservation | Le [parcours retenu](contrat-reservation-portail.md) est implémenté dans `73b299d` : ressource et créneau réservés atomiquement, contrôle commun CRM/terrain, version, audit, annulation et historiques. Fiche Client, portail, agenda et choix du membre sont paginés ; les anciennes confirmations ne sont pas transformées en réservations. Les [preuves locales](evidence/20261020-portal-bookings/README.md) ne remplacent pas la qualification PostgreSQL et navigateur encore requise. Les autres tâches et calendriers externes ne sont pas vérifiés pour la disponibilité. |
| Calendrier et connecteurs avancés | Invitations, disponibilité, conflits, récurrences, Microsoft personnel, préférences multicanal et connecteurs supplémentaires restent des extensions distinctes ; les comptes fournisseurs réels ne sont pas qualifiés. |
| Exploitation et présentation du candidat | CI complète et preuves natives du SHA retenu, migrations/configuration et recette du déploiement exact sont requises avant fusion. Charge, récupération distante, stockage durable, délivrabilité et traitement permanent sont des conditions supplémentaires d'ouverture commerciale. |

Le dépôt GitHub est privé lors du contrôle du 19 octobre. L'offre actuelle ne permet pas d'attester les protections de branche/rulesets interrogées ; la consultation de facturation disponible ne permet pas non plus d'attester un plafond de dépenses. Aucune visibilité, offre ou limite financière n'est modifiée. La démo garde son budget de 0 € et sa portée fictive en lecture seule.

## Portée et historique

Les tests SQL utilisent les vraies actions et contraintes avec authentification/cache simulés selon leurs fichiers. Les suites fournisseurs indiquent leurs simulations HTTP. La couverture concerne six modules configurés, pas l'application entière. Les 19 exclusions historiques du navigateur restent explicites et ne prouvent pas les mutations omises sur mobile.

La [carte des preuves](carte-des-preuves.md) relie risques, tests et limites. Les diagnostics [typage](evidence/20261014-ci-typecheck/README.md), [compilateur](evidence/20261014-build-memory/README.md), [Communications](evidence/20261014-communication-dashboard/README.md) et [transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) conservent les échecs précédents. Les [références antérieures](historique-qualification-candidat-20261010.md), le [journal](journal-recettes-completude-20261003.md) et les rapports versionnés sont conservés. Aucun compteur de tests ou ancien déploiement ne certifie tout le logiciel.

| Référence antérieure | Rapports conservés |
| --- | --- |
| Choix Produit Opérations | [bfe5d6b](evidence/20261013-candidate/ci-bfe5d6b.json) ; [échec ca6f6fb](evidence/20261013-candidate/ci-ca6f6fb.json) |
| Choix Client Opérations | [d36a38d](evidence/20261013-candidate/ci-d36a38d.json) |
| Prospects entrants | [ffee948](evidence/20261013-candidate/ci-ffee948.json) |
| Portail, Modèles et Affaires | [8d7b234](evidence/20261013-candidate/ci-8d7b234.json) |
| Choix Client Chantiers et facturation des temps | [19502a6](evidence/20261013-candidate/ci-19502a6.json), [12d3aa7](evidence/20261013-candidate/ci-12d3aa7.json) ; [échec 06d0d7c](evidence/20261013-browser-navigation/ci-06d0d7c.json) |
