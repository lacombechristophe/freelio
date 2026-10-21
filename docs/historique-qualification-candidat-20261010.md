# Historique de qualification du candidat Freelio

Les sections datées conservent les résultats et limites de leur commit. L’[état courant](completude-recette-20261003.md) reste la référence pour examiner le candidat actuel.

État du 10 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et le déploiement sont des références distinctes. Les résultats restent attachés au commit testé.

## Référence documentée en CI

**d82ed46** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38048411194) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38048414077) réussies. Les [rapports attachés au commit](evidence/20261010-preview-readiness/ci-d82ed46.json) comparent le code hors documentation à la fusion de test. Cette référence inclut les protections Organisation et Dépenses, le calendrier et la fixture future du portail. Les commits suivants de documentation se comparent à cette source qualifiée.

**c054bff** qualifie ensuite l'acquisition des images Linux : les deux CI passent 1 707 tests SQLite, 1 706 PostgreSQL et une exclusion native SQLite, 311 E2E et 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité. Le [rapport](evidence/20261010-expense-directory/ci-c054bff.json) conserve les références et identités exécutées. Les deux échecs de quota Redis sur le commit documentaire 61d7331 restent [conservés séparément](evidence/20261010-ci-runtime-images/quota-failures.json).

Le [complément Dépenses approuvé](contrat-depenses-listes-completes.md) ajoute recherche sur tout l'historique, pages de 25 et cartes complètes dans le mois civil de la société. Sa [recette](evidence/20261010-expense-directory/README.md) distingue diagnostic et contrôles locaux. Les résultats PostgreSQL, navigateur et hébergés du nouveau code sont attachés au SHA du candidat dans la [PR #8](https://github.com/lacombechristophe/freelio/pull/8) ; ils ne se déduisent pas de la qualification de c054bff.

| Contrôle, dans chacune des deux CI | Résultat |
| --- | --- |
| Types, deux lints, build et couverture ciblée | Réussis |
| SQLite, suite unitaire et couverture | 1 700 tests / 193 fichiers |
| PostgreSQL | 1 699 réussis ; une exclusion native SQLite |
| Navigateur | 311 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité |

Les [rapports de 369f413](evidence/20261009-order-billing-stale-balance/ci-369f413.json) vérifient 961 entrées hors documentation identiques à la fusion de test. Ils qualifient les quatorze cas des anciennes factures liées, les quatre cas d'avoirs concurrents et les six cas de calcul périmé, en conservant les contrôles antérieurs. Les quatre E2E Comptabilité, six Finance et quatre de pagination passent dans les deux runs ; aucun n'appartient aux dix-neuf exclusions. Les [rapports de d88a6bb](evidence/20261009-order-billing-roles/ci-d88a6bb.json) restent la référence antérieure.

La preview initiale répondait HTTP 503 de préparation. La [préparation du 10 octobre](evidence/20261010-preview-readiness/README.md) crée une base fictive dédiée à 60 migrations et vérifie huit contrôles du rôle lecteur. Le propriétaire renseigne Upstash et renonce à R2 pour respecter son budget de 0 €. Les sondes répondent désormais HTTP 200 ; connexion, lectures, refus d’écriture et PDF passent sur ordinateur et mobile. Après les échecs documentés de `bc8f2d6` et `960b8b6`, le [rejeu hébergé de 9086a5d](evidence/20261010-preview-readiness/hosted-9086a5d.json) réussit 49 pages/onglets sur chaque surface, sans erreur JavaScript. La [qualification sans stockage](qualification-demo-sans-stockage-20261010.md) donne la reproduction et les limites ; la CI du nouveau candidat reste distincte de la référence verte ci-dessus. Aucune fusion sur main n'est annoncée.

Un diagnostic SQL distinct reproduit six divulgations Finance/Commercial dans Organisation. Le [correctif approuvé](contrat-organisation-domaines-droits.md) protège maintenant les requêtes et les cartes. Sa [recette locale](evidence/20261010-preview-readiness/organisation-domain-local.json) passe quinze nouveaux cas SQL, puis 1 672 tests / 192 fichiers, types, lints et build. Les quinze cas PostgreSQL et les six E2E Organisation passent ensuite dans les deux CI de d82ed46. La preview du compte fictif Owner ne suffit pas à qualifier les autres rôles.

Les [deux CI de 021bfac](evidence/20261010-preview-readiness/ci-021bfac.json) passent les quinze cas Organisation sur PostgreSQL et les six E2E, mais échouent sur le rendez-vous du portail : 304 E2E réussis, un échec et 19 exclusions. Le test proposait le 10 octobre à 10 h, devenu passé ; la trace confirme le refus HTTP 400 prévu par l'API. Il calcule désormais des dates à sept et neuf jours. Le rejeu de d82ed46 confirme HTTP 201, la confirmation, le suivi et la révocation. Le [parcours hébergé de 021bfac](evidence/20261010-preview-readiness/hosted-021bfac.json) passe séparément ses deux surfaces et 49 pages/onglets chacune, sans erreur JavaScript.

Le [lot Dépenses approuvé](contrat-depenses-relations-droits.md) exclut les clients et chantiers étrangers des lectures et refuse les trois mutations, y compris une relation devenue étrangère entre lecture et écriture. Sa [recette locale](evidence/20261010-preview-readiness/expense-relations-local.json) passe 28 cas dédiés, puis 1 700 tests / 193 fichiers, types, lints et build. Les deux CI de d82ed46 passent les 28 cas Dépenses sur PostgreSQL et les six E2E, ainsi que les quinze cas Organisation et ses six E2E. Le [rejeu hébergé de ce candidat](evidence/20261010-preview-readiness/hosted-d82ed46.json) passe 49 pages/onglets sur chaque surface, sans erreur JavaScript, retry ni exclusion. Ce parcours Owner ne remplace pas les tests de rôles.

Les [rapports de 3f1ca72](evidence/20261009-operations-list-volume/ci-3f1ca72.json), de [0b6b8b3](evidence/20261009-operations-order-finance/ci-0b6b8b3.json), les [preuves de stock antérieures](evidence/20261009-stock-reservations/ci-88ce8dd.json) et de [facturation](evidence/20261009-invoice-actions/ci-de24513.json) restent conservés avec leur propre périmètre et commit.

## Portée du lot Récurrences

**565986e** implémente le [lot Récurrences approuvé](qualification-factures-recurrentes-20261009.md) : droits Finance, chantier relationnel, périmètre d’entretien et recherche/pagination complète. Sa [recette locale](evidence/20261009-recurring-read/local.json) passe 26 cas de périmètre, 13 cas worker et 33 cas Documents, puis 1 436 tests SQLite / 177 fichiers, types, lints et build de 75 pages. Le candidat 0f45087 qualifie ensuite ce code sur PostgreSQL et dans le navigateur compilé, avec les huit nouveaux E2E.

## Reproduire et examiner

Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Utiliser une copie isolée, les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les `.env`, données ou identifiants existants.

La [carte des preuves](carte-des-preuves.md) relie chaque invariant à ses tests et ses limites. Le [journal de recette](journal-recettes-completude-20261003.md) et les dossiers `evidence` conservent les diagnostics, échecs et qualifications antérieures. Une réussite ultérieure ne transforme pas un ancien run rouge en run vert. Un `playwright test --list` prouve seulement le chargement des tests ; les exécutions navigateur récentes proviennent de GitHub.

Les tests SQL utilisent les vraies actions et transactions selon leur périmètre ; les tests fournisseur utilisent HTTP simulé. Vérifier les mocks avant d’interpréter un résultat. Le [rapport de 10 000 exécutions](evidence/20261008-workflow-journal/README.md) décrit une mesure locale, pas une charge hébergée. Le contrôle de publication inspecte sources et historique sans garantir universellement l’absence de secret.

## Travaux encore nécessaires

Le correctif des [actions de facturation](evidence/20261009-invoice-actions/README.md), `e13d3d7`, passe localement 1 472 tests SQLite / 178 fichiers, types, lints et build. Les deux CI de de24513 qualifient ce correctif. Il couvre droits Finance explicites, société du client, calcul des avoirs cohérents et relecture des relances ; il ne ferme pas toute la chaîne financière. La [recette des réservations concurrentes](qualification-reservations-stock-20261009.md) est qualifiée par les deux CI de 88ce8dd, sans modification métier.

- Compléter la qualification des autres écritures financières : remboursements, avoirs, réservations et contention forte. Les [paiements concurrents](qualification-paiements-concurrents-20261008.md) et les [rapprochements](qualification-rapprochements-bancaires-20261008.md) ont leurs propres preuves.
- Vérifier les traces et sorties des scénarios, les sélecteurs encore plafonnés et les chaînes métier restantes du [plan fonctionnel](plan-completude-fonctionnelle-20261002.md), puis installation, récupération et démonstrations de L9.
- Qualifier comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations sont hors recette fictive et budget de 0 €.

Le correctif des [rattachements de réservation](evidence/20261009-stock-reservation-scope/README.md), `e25c8d1`, passe localement 1 496 tests SQLite / 180 fichiers, types, les deux lints et build. Ses douze cas de relations passent avec les douze cas de concurrence. Les deux CI de 0b6b8b3 qualifient ces douze cas sur PostgreSQL ; les CI antérieures ne qualifient pas ce code.

Le correctif serveur des [projections Client dans les détails Service](evidence/20261009-service-detail-metrics/README.md), `f88fa41`, conserve la présentation et applique la règle commune aux tickets, équipements et interventions. Ses 27 cas passent localement, puis la suite complète de 1 523 tests / 181 fichiers, types, lints et build. Les deux CI de 0b6b8b3 qualifient les 27 projections sur PostgreSQL.

Le [lot approuvé des commandes Opérations](evidence/20261009-operations-order-finance/README.md), `b32c563`, exclut les références et compteurs de factures sans Finance, protège les commandes de facturation et conserve les prix opérationnels. Seize cas SQL passent ; la qualification locale commune passe 1 539 tests / 182 fichiers, types, les deux lints et compilation. Les deux CI de 0b6b8b3 qualifient les seize cas PostgreSQL et les six E2E.

Le [lot de listes Commandes / Réservations](evidence/20261009-operations-list-volume/README.md), `67f90e8`, remplace les deux cartes plafonnées par des lecteurs paginés et autorisés avant total/recherche. Les commandes de stock sont réservées à Opérations en écriture, hors démo publique. Les deux CI de 3f1ca72 qualifient les dix-neuf cas PostgreSQL, les quatre nouveaux parcours navigateur et les six Finance conservés. Les tableaux du bootstrap et autres sélecteurs restent distincts.

La [revue CTO](revue-cto.md) donne un parcours de présentation et expose ces limites. Les résultats automatisés ne certifient ni tout le produit, ni l’accessibilité complète, ni les services externes.

Le correctif `39a3965` des [rattachements de facturation](evidence/20261009-order-billing-references/README.md) et de [Comptabilité](evidence/20261009-order-billing-roles/README.md) passe 33 nouveaux cas SQL, puis la suite locale de 1 591 tests / 185 fichiers, types, deux lints et compilation. Il recontrôle le client et le chantier avant la revendication transactionnelle et limite l'exemption Finance à `updateMany` de `billingStatus`. Les deux CI de d88a6bb qualifient ensuite les 33 cas sur PostgreSQL réel et les quatre E2E Comptabilité sur les deux surfaces. Les [résultats locaux](evidence/20261009-order-billing-roles/local.json) distinguent chargement et exécution.

Le complément `02a6e10` des [anciennes factures liées](evidence/20261009-order-linked-invoices/README.md) refuse les incohérences avant retour d'un acompte existant et calcul du solde, puis avant revendication transactionnelle. Les quatorze cas dédiés passent, ainsi que 1 605 tests / 186 fichiers, types, deux lints et compilation. Les quatorze cas passent aussi sur PostgreSQL dans les deux CI de 369f413. Les [quatre tests d'avoirs](qualification-avoirs-concurrents-20261009.md) qualifient séparément une garde existante, sans changement métier.

Le commit de tests `bfa6125` passe la suite commune de 1 609 tests / 187 fichiers, types et deux lints ; aucun code de production n'a changé depuis le build de `02a6e10`. Les quatre avoirs passent sur PostgreSQL dans les deux CI de 369f413, avec la barrière de lectures réelles. Un diagnostic distinct reproduit un [solde périmé après modification d'acompte](contrat-facturation-commandes-solde-perime.md). Le refus approuvé est implémenté dans `061173c` : six cas dédiés, puis [1 615 tests / 188 fichiers](evidence/20261009-order-billing-stale-balance/local.json), types, deux lints et build réussis. Ces résultats ne clôturent pas toute la chaîne financière.

Les jobs PostgreSQL et Linux des deux CI de `6c8cffb` échouent avant qualification pour dépassement du quota anonyme Docker Hub. Le [diagnostic du registre](evidence/20261009-ci-registry/README.md) conserve ces échecs. Le commit `7eda750` utilise les mêmes versions d'images officielles sur ECR Public ; les deux CI de 369f413 qualifient ensuite PostgreSQL et les neuf contrôles Linux. Le premier essai Linux de branche échoue sur un quota ECR, puis réussit sans changement de code après relance ciblée.

## Compléments du 13 au 20 octobre 2026

État intermédiaire conservé avant la qualification du tri et des relations des conversations. Les mentions « actuel » et « à poursuivre » ci-dessous se rapportent aux SHA de cette période, pas au dernier candidat.

### Résultat actuel

Le dernier candidat local, `d6d523145a8f05b62e5bf1be8d205715f02f9de5`, passe **2 900 tests SQLite dans 251 fichiers**, sans échec ni exclusion. Il complète la [rotation des synchronisations et leur supervision](evidence/20261020-sync-fairness/README.md), après les [conversations natives et leurs réparations](evidence/20261020-native-conversations/README.md). Ses 1 152 fichiers source correspondent à la recette ; migration historique, types, deux lints et build sont qualifiés avec la comparaison des deux fichiers modifiés après compilation. Le workflow est testé séparément sans réseau. Un dépassement de délai antérieur reste conservé, sans modification de la limite du test. Ce candidat n'est pas poussé : PostgreSQL et navigateur restent à qualifier, et le plafond GitHub Actions à 0 € reste non vérifiable par l'API disponible ou le navigateur désactivé dans Work.

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

### Corrections récentes

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

### Qualification à poursuivre

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

## Préflight du contenu des campagnes — 20 octobre 2026

`d00d517` complète les vérifications de contenu, liens et variables et empêche la réinterprétation des valeurs de contact. `59cbad2` inclut réellement les deux cas SSR dans le manifeste de tests, sans changer la production. Les [preuves](evidence/20261020-campaign-content/README.md) conservent les quatre échecs initiaux et 2 944 cas SQLite réussis sur une base neuve. Types et lints passent ; le build de d00d517 reste applicable. Quotas, domaine/fournisseur, PostgreSQL et navigateur restent distincts ; aucune nouvelle CI ni publication n'est effectuée.

## 21 octobre 2026 — Plafonds internes d’envoi

`ee695b3` raccorde la réservation atomique minute/jour aux trois transports CRM ; `e6ddcef` complète la preuve Comptabilité. `c689a50` déclare les prérequis des fixtures ; `3046a11` conserve les identifiants du relais et de la boîte choisis. La [qualification locale](evidence/20261020-mail-send-quotas/README.md) passe 2989 tests dans 259 fichiers sur une base neuve, sans exclusion. Les diagnostics initiaux, la régression de cascade trouvée puis corrigée et la preuve de mise à niveau sont conservés. Les plafonds exigent une configuration explicite ; aucun historique ou quota fournisseur n’est inventé. PostgreSQL, navigateur, CI distante et déploiement de ce code restent à qualifier ; aucun push n’a été effectué.

## Contrôle des expéditeurs — 21 octobre 2026

`deaa01b` refuse des identifiants Resend illisibles ; `6481266` contrôle boîte, scopes locaux et plafonds internes avant capture, activation et chaque lot. Les [preuves](evidence/20261021-campaign-send-preflight/README.md) conservent quatre diagnostics avant correction, puis **3013 tests dans 260 fichiers**, sans échec ni exclusion, sur une SQLite neuve. Types, lints et build de 76 pages passent ; 1173 fichiers source correspondent au commit. Les échecs de nettoyage des fixtures restent identifiés. Un quota rempli permet la mise en attente sans réservation par le rapport ; domaine, fournisseur et délivrabilité ne sont pas certifiés. PostgreSQL, navigateur et CI distante restent à qualifier ; aucun push ni déploiement du complément.

## Erreurs fournisseurs — 21 octobre 2026

`adbc86d` classe les réponses HTTP du transport, conserve les échéances de reprise et arrête les refus nécessitant une correction. `379709e` isole l’horloge de la fixture et ajoute le vérificateur de migration, sans changement de production. Trois diagnostics avant correction et le premier passage complet sont [conservés avec les preuves](evidence/20261021-provider-send-failures/README.md). La suite finale sur SQLite neuve passe **3061 tests dans 262 fichiers**, sans échec ni exclusion ; types, lints et build de 76 pages passent, avec 1178 fichiers source conformes. La migration ajoute une catégorie nullable sans reclasser l’historique. Son application PostgreSQL, le navigateur et la CI du candidat restent à qualifier ; aucun push ni déploiement de ce complément.


## 21 octobre — brouillons et annulation des achats

Les brouillons deviennent modifiables depuis Opérations et le dossier achat. L’annulation motivée conserve numéro, lignes et approbation, avant transmission seulement ; les rôles, références et révisions sont contrôlés dans la transaction avec l’audit. Le [contrat](gestion-brouillons-achats.md) fixe les limites. Le code 86485f2 et le complément de test b780638 sont [qualifiés localement](evidence/20261021-purchase-drafts/README.md) : 3 112 tests SQLite / 263 fichiers, 110 cas voisins, types/lints et build de 76 pages. Les 456 cas navigateur sont sélectionnés seulement. PostgreSQL, CI distante, déploiement et liste complète des achats restent ouverts.


## 21 octobre — historique et transitions des achats

`be2a4ef` remplace le plafond général de 100 achats par une recherche et un filtre d’état paginés, et calcule le compteur et les cinq aperçus sur tout le périmètre autorisé. `cd91aa4` recontrôle références et version lors de la soumission, approbation, transmission déclarée et accusé ; l’audit partage la transaction. Les [preuves](evidence/20261021-purchase-workflow/README.md) conservent le diagnostic de plafond, 34 échecs sur les 44 cas initiaux de transition et deux échecs de filtre d’agence de la première implémentation. La suite finale sur SQLite neuve passe **3 182 tests / 265 fichiers**, dont 180 cas achat ; types, deux lints et build de 76 pages passent, avec 1185 fichiers source conformes. Les 456 cas navigateur sont sélectionnés seulement. PostgreSQL, CI distante, déploiement et autres parcours L8/L9 restent distincts ; aucun push de ces compléments.


## 21 octobre — réceptions et inspection fournisseur

`64bb4a6` protège les références des réceptions, anomalies, retours et avoirs et place leur audit dans la transaction métier. `3d4941c` enregistre la décision d’inspection sans réécrire la livraison ; les pièces acceptées après contrôle deviennent retournables, dans la limite du rejet d’origine. La migration nullable ne classe aucun historique. Les [preuves](evidence/20261021-purchase-stock/README.md) conservent les 23 échecs initiaux de sécurité/intégrité et les trois scénarios métier d’inspection, ainsi que deux assertions de représentation revues. Suite finale : **3 225 tests / 267 fichiers**, dont 239 cas achat/dépôt ; types, lints et build de 76 pages passent, avec 1191 fichiers source conformes. La mise à niveau SQLite conserve 11 lignes de dix tables ; le diff PostgreSQL est contrôlé hors ligne. Les 458 cas navigateur sont sélectionnés seulement. Aucun push ni déploiement ; qualification PostgreSQL/Linux/navigateur du candidat encore requise.
