# Qualification du candidat Freelio

État du 21 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le candidat local `f14d982ac65f29675b2b376bffe9858a7a81c293` complète les [choix Commande/Chantier des réservations](evidence/20261021-reservation-choices/README.md). La [qualification des PDF réels des bons](evidence/20261021-delivery-pdf/README.md) porte sur une source inchangée. Il recontrôle les [réservations de stock et leur audit dans la transaction](evidence/20261021-stock-reservations/README.md). Les [choix Commande/Ligne](evidence/20261021-delivery-choices/README.md) et l’[historique des bons](evidence/20261021-delivery-directory/README.md) restent complets. Les [protections des commandes et captures signées](evidence/20261021-delivery-seals/README.md) restent incluses : références et versions recontrôlées, quantités décimales bornées, audit transactionnel et contenu signé conservé. La capture HTML est chiffrée ; les octets PDF sont produits à la demande.

Les [réceptions et inspections fournisseur](evidence/20261021-purchase-stock/README.md), l’[historique complet et les validations](evidence/20261021-purchase-workflow/README.md), l’[édition et l’annulation avant transmission](evidence/20261021-purchase-drafts/README.md), la [classification des erreurs fournisseurs](evidence/20261021-provider-send-failures/README.md) et les [plafonds internes d’envoi](evidence/20261020-mail-send-quotas/README.md) restent inclus. Ces contrôles ne garantissent ni le quota fournisseur, ni la délivrabilité, ni la gratuité.

| Contrôle local sur ce code | Résultat |
| --- | --- |
| Suite SQLite, base fictive neuve | **3 369 tests / 273 fichiers**, aucun échec ni exclusion |
| Réservations, dépôts et lecteurs de commandes | 130 cas dans 6 suites, présents et réussis dans la même suite complète |
| Choix de commande et de chantier des réservations | 29 cas dédiés et 42 voisins dans quatre suites, présents et réussis dans la même suite complète |
| Achats et dépôts : écritures, inspection, historique et transitions | 239 cas dans 8 suites, présents et réussis dans la même suite complète |
| Types, génération des routes, ESLint et Oxlint | Réussis |
| Build Next.js | Réussi sur f14d982, 76 pages statiques |
| Identité des sources de la recette | 1210 fichiers conformes au commit |
| Générateur PDF : socle | Quatre contrôles réussis, dont trois sur Chromium réel ; documents métier distincts |
| Bons de livraison : PDF natifs | Trois cas réussis ; 37 contrôles hors ligne du lot PDF, sur une source inchangée |
| Playwright | 466 cas sélectionnés, 233 par surface ; **non exécutés** |

Ce code n'est pas poussé. La PR distante reste sur `8d2232385f8cfcca9006d5e56ecdb3794485610c` : ses contrôles fonctionnels passent, mais les deux CI échouent sur les uploads refusés pour quota. Le résultat d'une ancienne CI ou preview ne qualifie pas les compléments locaux.

## Corrections récentes

| Invariant | Point d'entrée |
| --- | --- |
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

## Qualification à poursuivre

1. Vérifier et consigner le plafond GitHub Actions à 0 € et l'arrêt de l'usage payant avant tout push déclenchant une nouvelle CI.
2. Qualifier les migrations additives `20261021010000_mail_provider_failure_kind`, `20261021020000_purchase_issue_resolution_kind` et `20261021030000_delivery_note_seal`, puis les contrôles PostgreSQL, de l’image Linux (dont les PDF métier) et du navigateur sur le SHA candidat ; vérifier aussi les uploads d'artefacts, dont le quota n'est pas attesté rétabli par le nettoyage autorisé.
3. Recetter la preview du même code, puis examiner la fusion et la publication. Main, la branche candidate et la production restent des références distinctes.

La démo garde un budget de 0 € et des données fictives en lecture seule. Stockage durable, comptes OAuth/transport réels, délivrabilité, charge, reprise après arrêt brutal et récupération distante restent des conditions d'ouverture commerciale ; aucun abonnement R2 n'est engagé.

## Dernière référence entièrement qualifiée

`2b05e5f6d425542971285f13170fbcb44bb6f1bb` complète le Stock. Ses deux CI passent entièrement : 2 287 SQLite, 2 286 PostgreSQL avec une exclusion native SQLite, 407 parcours navigateur avec 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité par run. Sa lecture hébergée passe 49 visites par surface. Les [preuves CI](evidence/20261013-candidate/ci-2b05e5f.json), l'[identité](evidence/20261013-candidate/source-2b05e5f.json) et la [lecture hébergée](evidence/20261013-candidate/hosted-2b05e5f.json) restent datées ; elles ne qualifient pas les évolutions suivantes.

## Écarts fonctionnels encore ouverts

Les corrections d'intégrité et les listes complètes ne suffisent pas à clore le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md). Les points suivants restent distincts des résultats CI :

| Point | Comportement actuel et prochaine condition |
| --- | --- |
| L8 : commandes client et livraisons | [Création, quantités et capture signée qualifiées localement](evidence/20261021-delivery-seals/README.md). Les anciennes empreintes sans capture ne permettent pas de régénérer le document. [Historique des bons complet qualifié localement](evidence/20261021-delivery-directory/README.md) ; [choix Commande/Ligne complets qualifiés localement](evidence/20261021-delivery-choices/README.md). [Références et audit des réservations qualifiés localement](evidence/20261021-stock-reservations/README.md). [Choix des réservations qualifiés localement](evidence/20261021-reservation-choices/README.md). Politiques d’annulation/clôture, autres choix de chantier, édition après confirmation, annulation après livraison et réparation historique restent distincts ; [PDF natifs Windows qualifiés](evidence/20261021-delivery-pdf/README.md) ; PostgreSQL, Linux et navigateur restent à qualifier. |
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

Le dépôt GitHub est privé lors du contrôle du 21 octobre. La vérification des protections de branche/rulesets et du plafond de dépenses n'est pas clôturée. Aucune visibilité, offre ou limite financière n'est modifiée. La démo garde son budget de 0 € et sa portée fictive en lecture seule.

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
