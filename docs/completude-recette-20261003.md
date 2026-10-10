# Qualification du candidat Freelio

État du 10 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et le déploiement sont des références distinctes. Les résultats restent attachés au commit testé.

## Référence documentée en CI

**6156c83** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38004872732) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38004876061) réussies. Les [rapports attachés au commit](evidence/20261010-preview-readiness/ci-6156c83.json) comparent aussi le code hors documentation à la fusion de test. Cette référence inclut le profil de démo sans stockage ; elle précède les corrections de calendrier.

| Contrôle, dans chacune des deux CI | Résultat |
| --- | --- |
| Types, deux lints, build et couverture ciblée | Réussis |
| SQLite, suite unitaire et couverture | 1 641 tests / 189 fichiers |
| PostgreSQL | 1 640 réussis ; une exclusion native SQLite |
| Navigateur | 291 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité |

Les [rapports de 369f413](evidence/20261009-order-billing-stale-balance/ci-369f413.json) vérifient 961 entrées hors documentation identiques à la fusion de test. Ils qualifient les quatorze cas des anciennes factures liées, les quatre cas d'avoirs concurrents et les six cas de calcul périmé, en conservant les contrôles antérieurs. Les quatre E2E Comptabilité, six Finance et quatre de pagination passent dans les deux runs ; aucun n'appartient aux dix-neuf exclusions. Les [rapports de d88a6bb](evidence/20261009-order-billing-roles/ci-d88a6bb.json) restent la référence antérieure.

La preview initiale répondait HTTP 503 de préparation. La [préparation du 10 octobre](evidence/20261010-preview-readiness/README.md) crée une base fictive dédiée à 60 migrations et vérifie huit contrôles du rôle lecteur. Le propriétaire renseigne Upstash et renonce à R2 pour respecter son budget de 0 €. Les sondes répondent désormais HTTP 200 ; connexion, lectures, refus d’écriture et PDF passent sur ordinateur et mobile. Le parcours documentaire de `bc8f2d6` ne relève plus d'erreur React, mais sa revue élargie en trouve quatre. Après le lot calendrier approuvé, le rejeu de `960b8b6` en trouve encore une dans Planning. Le complément et son test hébergé versionné sont décrits dans la [qualification sans stockage](qualification-demo-sans-stockage-20261010.md) ; leur recette reste distincte de la CI verte ci-dessus. Aucune fusion sur main n'est annoncée.

Un diagnostic SQL distinct reproduit six divulgations Finance/Commercial dans Organisation. Son [contrat de correction](contrat-organisation-domaines-droits.md) attend l'approbation des mentions visibles. Ce défaut interdit de déclarer tous les parcours et rôles prêts, même si la preview du compte fictif Owner est consultable.

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
