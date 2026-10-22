# Qualification du candidat Freelio

État du 23 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le candidat `8c55ca4ba23c73e53c044b0ee4e860abd09754f2` complète les [refus en production et la recette navigateur](evidence/20261023-production-errors/README.md) : message sûr pour les créneaux invalides, scénarios corrigés et attentes individuelles bornées. Sa [suite locale complète](evidence/20261023-production-errors/local-full.json) passe **3 936 tests / 293 fichiers**, aucun échec ni exclusion, sur SQLite neuve ; les seuils de couverture des six modules configurés passent. Types, ESLint/Oxlint et build propre de 76 pages réussissent. Les [130 cas ciblés](evidence/20261023-production-errors/planning-local.json) comprennent la reproduction puis la correction des créneaux invalides. Les 518 E2E restent sélectionnés sans exécution locale. Sa propre CI complète reste requise.

La [CI précédente de df22623](evidence/20261023-production-errors/ci-df22623.json) confirme 3 933 tests PostgreSQL, une exclusion SQLite, 72 migrations et neuf contrôles Linux. Chaque runner passe 3 934 tests SQLite, types, lint, couverture, build et audits sans vulnérabilité signalée. Les navigateurs consignent neuf échecs avant l’arrêt à 45 minutes ; 179/259 scénarios desktop et 129/259 mobiles ont commencé, sans qualification complète. Les uploads échouent pour quota. Le propriétaire poursuit sans navigateur local : migrations distantes et recette authentifiée restent non vérifiées.

La [tentative CI de 8c55ca4](evidence/20261023-production-errors/ci-8c55ca4.json) est refusée au lancement par un contrôle de facturation/plafond GitHub : les quatre jobs ont zéro étape exécutée. Ce diagnostic est distinct du quota d’artefacts. Sa preview READY répond HTTP 200 aux sondes de vie et de disponibilité ; le `SELECT 1` de cette sonde ne qualifie pas les migrations ni les parcours authentifiés. Aucun budget ou réglage de compte n’est modifié.

Le candidat `6274f54f04d37a05f00b64fad988bc0609a0cb40` contient les [corrections des défauts révélés par PostgreSQL](evidence/20261022-postgres-compatibility/README.md) : reprise bornée des transactions annulées, rattachement stable des réceptions et coordination correcte du test de stock. La nouvelle CI confirme 3 925 tests PostgreSQL réussis, une exclusion propre à SQLite et 72 migrations appliquées ; le runner desktop passe 3 926 tests SQLite, types, lint et build. Les neuf contrôles Linux passent aussi. Cette qualification reste rouge : Chromium n’a pas pu être installé sur le runner desktop (dépôt APT Microsoft HTTP 403), les E2E mobiles ont été interrompus après cinq échecs consignés et les uploads restent refusés pour quota. La [preuve native](evidence/20261022-postgres-compatibility/ci-6274f54.json) et le [diagnostic UI précédent](evidence/20261022-postgres-compatibility/ui-diagnostic-9f09bd5.json) conservent les SHA, étapes et limites.

La dernière suite locale complète ci-dessous appartient au socle `55b5ac5a5460cc4a5fc93bcbd7c3d44dffdb6ff9`, avec la [mise à niveau Next.js 16.4.2](evidence/20261022-next-security/README.md). Le [choix Ticket SAV](evidence/20261022-intervention-tickets/README.md), les [accords de renouvellement](evidence/20261022-maintenance-signing/README.md) et les corrections précédentes restent inclus. Les constats critiques de la version 16.3.8 sont conservés comme diagnostics datés, pas comme état du nouveau lockfile.

Les corrections précédentes restent incluses. La [carte des preuves](carte-des-preuves.md) donne leurs points d’entrée ; les résultats locaux ci-dessous qualifient ce code, dans les limites indiquées.

| Contrôle local sur le socle 55b5ac5 | Résultat |
| --- | --- |
| Suite SQLite avec outillage corrigé, base fictive neuve | **3 913 tests / 292 fichiers**, aucun échec ni exclusion |
| Choix Ticket SAV de Nouvelle intervention | 47 cas SQL ; 230 avec les voisins, réussis séparément et dans la suite complète |
| Signature de renouvellement, conditions convenues et conservation historique | 35 cas SQL ; 340 avec les voisins, réussis séparément et dans la suite complète |
| Centre de support : périmètre, file complète, liens et fuseau | 30 cas SQL et deux rendus serveur ; 194 avec les voisins, réussis séparément et dans la suite complète |
| Création de proposition, source affichée, droits Sales et audit obligatoire | 30 cas dédiés ; 246 avec les voisins, réussis séparément et dans la suite complète |
| Création du terme renouvelé et bascule de facturation | 31 cas dédiés ; 173 avec les voisins, réussis séparément et dans la suite complète |
| Réglages de renouvellement, version et audit obligatoire | 31 cas dédiés ; 125 avec les voisins, réussis séparément et dans la suite complète |
| Listes Service, planning complet et états de pagination | 53 cas dédiés et deux rendus statiques ; 135 avec les voisins, réussis séparément et dans la suite complète |
| Totaux et aperçus Opérations, agences et démo | 30 cas dédiés ; 141 avec les voisins, réussis séparément et dans la suite complète |
| Choix Chantier des trois créations Opérations et gardes de démo | 32 cas dédiés ; 112 avec les voisins, réussis séparément et dans la suite complète |
| Contrat issu du devis et reprise après création de commande | 29 cas dédiés ; 154 avec les voisins, réussis séparément et dans la suite complète |
| Devis accepté → commande | 32 cas dédiés ; 114 avec les voisins, réussis séparément et dans la suite complète |
| Ancien lecteur Chantiers, annuaire et lecteurs partagés | 96 cas dans trois suites, présents et réussis dans la suite complète ; 191 avec les voisins réussis séparément |
| Modèles, dossier chantier et lecteurs voisins | 209 cas dans sept suites, dont 24 dédiés aux modèles ; réussis séparément et dans la suite complète |
| Dossier chantier, cycle de vie et lecteurs partagés | 173 cas dans cinq suites : 71 SQL dédiés, quatre rendus statiques et 98 voisins, réussis séparément et dans la suite complète |
| Chantiers : cycle de vie, version et choix Client | 37 cas dédiés et 49 voisins dans trois suites, présents et réussis dans la même suite complète |
| Réservations, dépôts et lecteurs de commandes | 130 cas dans 6 suites, présents et réussis dans la même suite complète |
| Choix de commande et de chantier des réservations | 29 cas dédiés et 42 voisins dans quatre suites, présents et réussis dans la même suite complète |
| Achats et dépôts : écritures, inspection, historique et transitions | 239 cas dans 8 suites, présents et réussis dans la même suite complète |
| Types, génération des routes, ESLint et Oxlint | Réussis |
| Build Next.js | Réussi sur 55b5ac5 avec Next.js 16.4.2, 76 pages statiques ; ancien dossier de build écarté |
| Identité des sources de la recette | 1 256 fichiers conformes au commit ; 710 versions installées comparées au lockfile |
| Audits npm production et complet | Nouveaux rapports du 22 octobre sur Next.js 16.4.2 : zéro vulnérabilité signalée, exit 0 dans les deux cas. Les rapports critiques 16.3.8 restent conservés ; aucune autre résolution de paquet ne change |
| Générateur PDF : socle | Quatre contrôles réussis, dont trois sur Chromium réel ; documents métier distincts |
| Bons de livraison : PDF natifs | Trois cas réussis ; 37 contrôles hors ligne du lot PDF, sur une source inchangée |
| Playwright | 518 cas sélectionnés, 259 par surface ; **non exécutés** |

Une exécution de la version précédente ab42ad1 a dépassé cinq secondes sur une réponse Google ; les trois cas passent isolément puis dans une nouvelle suite complète, sans changement de code, d’assertion ou de délai. Le [rapport reste conservé](evidence/20261022-maintenance-settings/README.md) et sa cause n’est pas établie. Le présent lot ne prétend pas la corriger.

Le [run de 9f09bd5](https://github.com/lacombechristophe/freelio/actions/runs/39855959357) exécute les migrations et les neuf contrôles natifs Linux, mais sa suite PostgreSQL compte dix échecs, 3 902 réussites et une exclusion historique. Les uploads échouent aussi pour quota, malgré le nettoyage des 269 archives déjà autorisé et terminé. La preview de cette tête est READY après correction de l’attribution GitHub ; ses migrations distantes et parcours authentifiés ne sont pas qualifiés par ce seul état. Les contrôles du candidat corrigé sont à lire dans la [PR #8](https://github.com/lacombechristophe/freelio/pull/8/checks), en vérifiant leur SHA. Aucune fusion ni publication en production n’est revendiquée.

## Corrections récentes

| Invariant | Point d'entrée |
| --- | --- |
| Choix Ticket SAV : recherche et pagination complètes pour le site vérifié, sélection conservée et refus sans perte de saisie | [Contrat distinct et limites](evidence/20261022-intervention-tickets/README.md) |
| Signature de renouvellement : conditions capturées, nouvelle signature requise après changement, capture initiale conservée | [Accords et limites](evidence/20261022-maintenance-signing/README.md) |
| Centre de support : références et compteurs société/agence, priorités et délais réels, pages et totaux complets | [File et limites](evidence/20261022-help-desk/README.md) |
| Proposition d’entretien : source affichée et site versionnés, création/audit atomiques, rôle Commercial et tarifs HT | [Proposition et limites](evidence/20261022-maintenance-proposal/README.md) |
| Nouveau terme d’entretien : source affichée complète, bascule atomique de facturation et audit ; paramètres non enregistrés protégés | [Création et limites](evidence/20261022-maintenance-renewal/README.md) |
| Réglages d’entretien : version affichée, périmètre et audit atomique ; Service limité aux champs de cette action | [Sauvegarde et limites](evidence/20261022-maintenance-settings/README.md) |
| Tickets, Interventions et Maintenance : listes paginées ; capacité et tournées complètes ; priorité métier et état inconnu distinct du vide | [Lectures et limites](evidence/20261022-operations-service/README.md) |
| SAV et interventions : totaux complets et six aperçus du périmètre ; comparaison des agences indépendante des caches | [Calculs et limites](evidence/20261022-operations-activity/README.md) |
| Choix Chantier des créations : périmètre complet, racines Client/Site et sélection hors page vérifiée ; lectures de démo limitées | [Sélecteurs et limites](evidence/20261022-operations-project-choices/README.md) |
| Contrat issu du devis : révision/date vérifiées, brouillon et audit atomiques ; résultat partiel du dossier explicite et récupérable | [Préparation et reprise](evidence/20261022-quote-contract-conversion/README.md) |
| Conversion du devis : révision affichée, version courante et audit obligatoires ; Commercial sans droits Opérations généraux | [Création de commande et limites](evidence/20261022-quote-order-conversion/README.md) |
| Ancien lecteur de liste : références Modèle/Agence/Site exclues avant pagination ; ordre déterministe | [Liste et périmètre](evidence/20261022-project-list/README.md) |
| Modèles : prérequis étrangers masqués, activité et audit atomiques, version affichée vérifiée et graphe invalide refusé avant création d’un chantier | [Modèles et limites](evidence/20261021-project-templates/README.md) |
| Dossier chantier : droits avant lecture, références et versions relues, audit obligatoire ; dates calendaires stables | [Jalons, réceptions et relevé](evidence/20261021-project-workspace/README.md) |
| Outillage de test corrigé sans paquet de production changé ; audits et nouvelle exécution complète | [Vite et Vitest](evidence/20261021-test-toolchain/README.md) |
| Mutations de chantier et audit atomiques ; version affichée vérifiée ; purge physique distinguée du commit SQL | [Chantiers et limites](evidence/20261021-project-lifecycle/README.md) |
| Réservation et références relues dans la transaction, sans mouvement ou état validé après refus d’audit | [Stock et audit](evidence/20261021-stock-reservations/README.md) |
| Commande et ligne de livraison retrouvées hors page, sans substituer une référence devenue indisponible | [Choix complets](evidence/20261021-delivery-choices/README.md) |
| Historique des bons retrouvé au-delà de 100 ; recherche, état et agence combinés avant pagination | [Liste complète](evidence/20261021-delivery-directory/README.md) |
| Livraison sans reliquat décimal ni référence étrangère ; capture signée conservée et liée à son bon | [Commandes et capture](evidence/20261021-delivery-seals/README.md) |
| Réception/retour sans références étrangères ni audit partiel ; inspection acceptée retournable une seule fois | [Écritures et inspection](evidence/20261021-purchase-stock/README.md) |
| Achat ancien retrouvable, compteur complet et validation sans écrasement ni audit partiel | [Historique et transitions](evidence/20261021-purchase-workflow/README.md) |
| Brouillon achat corrigé sans écrasement ; annulation motivée sans suppression avant transmission | [Règles et limites](gestion-brouillons-achats.md) |
| Délai fournisseur respecté et commande invalide non répétée automatiquement | [Erreurs et reprises](contrat-erreurs-fournisseurs-courriels.md) |
| Activation suspendue si la boîte ou ses plafonds ne sont plus configurés | [Contrôle de l’expéditeur](contrat-preflight-expediteur-campagnes.md) |
| Réservations concurrentes, attentes, annulation limitée et boîtes privées | [Plafonds internes](contrat-plafonds-envoi.md) |
| Contenu de campagne vérifié sans interpréter les valeurs de contact comme des modèles | [Préflight et limites](contrat-preflight-contenu-campagnes.md) |
| Filtres combinés, archives conservées et attribution concurrente | [Gestion des conversations](contrat-tri-conversations.md) |
| Références étrangères exclues des fils, messages et événements, même pour Owner/Admin | [Relations des conversations](contrat-relations-conversations.md) |
| Conversations natives séparées et réparation sans réaffectation historique | [Qualification](evidence/20261020-native-conversations/README.md) |
| Rotation des synchronisations indépendante du succès et erreurs visibles du cron | [Qualification](evidence/20261020-sync-fairness/README.md) |

Les qualifications intermédiaires et leurs échecs conservés sont regroupés dans l'[historique](historique-qualification-candidat-20261010.md#compléments-du-13-au-20-octobre-2026). Chaque preuve reste attachée à son commit.

## Contrôles de livraison

1. Les gardes locales de dépendances et de budget sont satisfaites : [Next.js 16.4.2 qualifié](evidence/20261022-next-security/README.md), [budget Actions](evidence/20261022-intervention-tickets/actions-budget.json) observé à 0 $/0 $, « Usage blocked », sans changement de réglage. Cette observation ne garantit pas le quota des minutes incluses ni des artefacts.
2. Qualifier les migrations additives `20261021010000_mail_provider_failure_kind`, `20261021020000_purchase_issue_resolution_kind`, `20261021030000_delivery_note_seal` et `20261022010000_maintenance_renewal_terms`, puis les contrôles PostgreSQL, de l’image Linux (dont les PDF métier) et du navigateur sur le SHA candidat ; vérifier aussi les uploads d'artefacts, dont le quota n'est pas attesté rétabli par le nettoyage autorisé.
3. Recetter la preview du même code, puis examiner la fusion et la publication. Main, la branche candidate et la production restent des références distinctes.

La démo garde un budget de 0 € et des données fictives en lecture seule. Stockage durable, comptes OAuth/transport réels, délivrabilité, charge, reprise après arrêt brutal et récupération distante restent des conditions d'ouverture commerciale ; aucun abonnement R2 n'est engagé.

## Dernière référence entièrement qualifiée

`2b05e5f6d425542971285f13170fbcb44bb6f1bb` complète le Stock. Ses deux CI passent entièrement : 2 287 SQLite, 2 286 PostgreSQL avec une exclusion native SQLite, 407 parcours navigateur avec 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité par run. Sa lecture hébergée passe 49 visites par surface. Les [preuves CI](evidence/20261013-candidate/ci-2b05e5f.json), l'[identité](evidence/20261013-candidate/source-2b05e5f.json) et la [lecture hébergée](evidence/20261013-candidate/hosted-2b05e5f.json) restent datées ; elles ne qualifient pas les évolutions suivantes.

## Écarts fonctionnels encore ouverts

Les corrections d'intégrité et les listes complètes ne suffisent pas à clore le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md). Les points suivants restent distincts des résultats CI :

| Point | Comportement actuel et prochaine condition |
| --- | --- |
| L8 : indicateurs et listes Opérations | [Listes Service et planning](evidence/20261022-operations-service/README.md), [totaux et aperçus](evidence/20261022-operations-activity/README.md), puis [Centre de support principal](evidence/20261022-help-desk/README.md) qualifiés localement. File complète, priorités métier et compteurs du périmètre ; responsables recherchables et paginés. Les références examinées des formulaires de création utilisent des lecteurs dédiés, dont le [Ticket SAV](evidence/20261022-intervention-tickets/README.md). Agence, Membre et Dépôt sont lus sans plafond take ; les plans prévoient 2/10/30 sièges et 1/3/10 agences. Ce constat clôt ces sources de création seulement : les autres consommateurs des caches et les volumes historiques restent distincts. Le classement SLA conserve les clés de tous les résultats ; charge, mémoire sur grand portefeuille, PostgreSQL et interactions navigateur restent à qualifier. |
| L8 : renouvellement d’entretien | [Réglages](evidence/20261022-maintenance-settings/README.md), [terme/facturation](evidence/20261022-maintenance-renewal/README.md), [proposition](evidence/20261022-maintenance-proposal/README.md) et [accord signé sur les conditions](evidence/20261022-maintenance-signing/README.md) qualifiés localement. Prix et conditions revérifiés aux trois transitions ; nouveau document après changement, anciens accords conservés et historique sans preuve bloqué. Migration PostgreSQL, autres politiques d’état, réparation historique, plusieurs travailleurs et interactions navigateur restent à qualifier séparément. |
| L8 : choix Chantier des créations Opérations | [Trois sélecteurs qualifiés localement](evidence/20261022-operations-project-choices/README.md), y compris les lectures de démo. Les interactions navigateur préparées et PostgreSQL restent à qualifier. Les sources des références de création examinées sont traitées, y compris le Ticket SAV ; les autres consommateurs des caches et autres sélecteurs du logiciel restent distincts. |
| L8 : commandes client et livraisons | [Conversion de commande](evidence/20261022-quote-order-conversion/README.md) et [contrat optionnel](evidence/20261022-quote-contract-conversion/README.md) qualifiés localement, en deux actions avec reprise du résultat partiel. [Création, quantités et capture signée qualifiées localement](evidence/20261021-delivery-seals/README.md). Les anciennes empreintes sans capture ne permettent pas de régénérer le document. [Historique des bons complet qualifié localement](evidence/20261021-delivery-directory/README.md) ; [choix Commande/Ligne complets qualifiés localement](evidence/20261021-delivery-choices/README.md). [Références et audit des réservations qualifiés localement](evidence/20261021-stock-reservations/README.md). [Choix des réservations qualifiés localement](evidence/20261021-reservation-choices/README.md). Politiques d’annulation/clôture, édition après confirmation, annulation après livraison et réparation historique restent distincts ; [PDF natifs Windows qualifiés](evidence/20261021-delivery-pdf/README.md) ; PostgreSQL, Linux et navigateur restent à qualifier. |
| L8 : cycle des achats fournisseur | [Réceptions, inspections, retours et avoirs qualifiés localement](evidence/20261021-purchase-stock/README.md), en complément de l’historique complet, des validations, de l’édition et de l’annulation avant transmission : stock, décisions et audit atomiques, acceptations bornées et observations de livraison conservées. Modification après soumission, annulation après transmission/réception, réparation des décisions historiques inconnues, PostgreSQL et interactions navigateur restent distincts. |
| L2 : erreurs HTTP des transports CRM | [Classifiées et qualifiées localement](evidence/20261021-provider-send-failures/README.md) : échéance durable, arrêt des refus définitifs, brouillons conservés et reprises bornées. La catégorie ne prouve pas le résultat d’un appel antérieur. Limitation globale d’un compte partagé, renouvellement OAuth, synchronisation, PostgreSQL et interactions navigateur restent distincts ; ce complément ne clôt pas tout L2. |
| MAIL-02 : état et pièces des messages entrants | Le [lot](contrat-etats-messageries-entrantes.md) est implémenté dans `d02c701` et `8a7f9a6` : history/delta, observation séparée du suivi CRM, copies conservées, reprise sans réception rejouée et pièces PDF/PNG/JPEG bornées avec ACL revérifiées. Les [preuves locales](evidence/20261020-mail-observations/README.md) couvrent aussi les reconnexions intercalées. PostgreSQL, navigateur et comptes réels restent à qualifier ; import historique exhaustif, archivage durable et analyse antivirus ne sont pas livrés. |
| MAIL-05 : identité native des fils entrants | [Implémentée et qualifiée localement sur `1dd29ef`](evidence/20261020-native-conversations/README.md) : séparation native, préparation/acceptation et réparations, contrainte par société/boîte, anciens fils non réaffectés. Les diagnostics initiaux restent conservés. PostgreSQL, navigateur et comptes fournisseurs réels restent distincts. |
| MAIL-04/06 : tri et suivi de la boîte de réception | [Implémentés et qualifiés localement](evidence/20261020-inbox-management/README.md) : boîte/état/attribution, archivage/restauration, prise en charge personnelle et libération administrative. Les relations étrangères sont exclues des lectures et actions. PostgreSQL et les parcours navigateur préparés restent à qualifier. Ce lot ne livre pas les quotas d’envoi ni l’archivage durable des pièces. |
| L7 : préflight de campagne | Contenu et liens [qualifiés localement](evidence/20261020-campaign-content/README.md), puis [boîte et plafonds internes](evidence/20261021-campaign-send-preflight/README.md) : rôle courant, identifiants lisibles, scopes mail/brouillons, configuration explicite, pause/reprise sans répétition et capacité observée sans réservation. Domaines authentifiés, plafonds fournisseur, test sur destinataire autorisé et métriques restent ouverts ; PostgreSQL et interactions navigateur restent à qualifier. |
| OPS-03 : progression des boîtes à synchroniser | [Rotation et supervision qualifiées localement](evidence/20261020-sync-fairness/README.md) : ordre persistant distinct du succès, anciennes valeurs nulles prioritaires, réservation comparée avant traitement, horloge reculée, sociétés distinctes et contrôle du verrou. L'API signale les échecs au cron et les reprises restent confiées aux traitements durables. Les [plafonds par boîte](evidence/20261020-mail-send-quotas/README.md) sont qualifiés localement ; charge, comptes réels et qualification distante restent distincts. |
| CAL-01 : progression de la fenêtre calendrier | [Implémentée dans `1194b51`](evidence/20261020-calendar-window/README.md) : fenêtre associée au checkpoint chiffré, renouvellement paginé, anciennes copies conservées, transactions et génération de connexion. SQL/HTTP simulé qualifiés localement ; PostgreSQL et comptes réels distincts. |
| CRM-01 : cycle de vie des référentiels | Fournisseurs dispose d'édition/désactivation qualifiées. Les [dépôts](gestion-depots.md), [sites et équipements](gestion-sites-equipements.md) disposent de leurs parcours locaux d’édition et d’activité, avec protections transactionnelles et historiques conservés. Le [transfert complet d’agence avec audit](transfert-dossier-site.md) est implémenté. La [suite complète de 2 664 cas](evidence/20261020-site-transfers/README.md) passe sur `ae1b02f` ; qualification PostgreSQL et navigateur des nouveaux parcours encore requise. |
| PORTAL-01 : demande et réservation | Le [parcours retenu](contrat-reservation-portail.md) est implémenté dans `73b299d` : ressource et créneau réservés atomiquement, contrôle commun CRM/terrain, version, audit, annulation et historiques. Fiche Client, portail, agenda et choix du membre sont paginés ; les anciennes confirmations ne sont pas transformées en réservations. Les [preuves locales](evidence/20261020-portal-bookings/README.md) ne remplacent pas la qualification PostgreSQL et navigateur encore requise. Les autres tâches et calendriers externes ne sont pas vérifiés pour la disponibilité. |
| Calendrier et connecteurs avancés | Invitations, disponibilité, conflits, récurrences, Microsoft personnel, préférences multicanal et connecteurs supplémentaires restent des extensions distinctes ; les comptes fournisseurs réels ne sont pas qualifiés. |
| Exploitation et présentation du candidat | CI complète et preuves natives du SHA retenu, migrations/configuration et recette du déploiement exact sont requises avant fusion. Charge, récupération distante, stockage durable, délivrabilité et traitement permanent sont des conditions supplémentaires d'ouverture commerciale. |

Le dépôt GitHub est privé lors du contrôle du 22 octobre. Les API de protections de branche et de rulesets répondent HTTP 403, avec une demande de changement d’offre pour un dépôt privé ; aucune protection effective n’est attestée. Le budget Actions du compte est observé à 0 $, avec usage bloqué ; les minutes incluses et le quota d’artefacts restent distincts. Aucune visibilité, offre ou limite financière n'est modifiée. La démo garde son budget de 0 € et sa portée fictive en lecture seule.

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
