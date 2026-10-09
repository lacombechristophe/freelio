# Qualification du candidat Freelio

État du 9 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et le déploiement sont des références distinctes. Les résultats restent attachés au commit testé.

## Référence documentée en CI

**0b6b8b3** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/37971308847) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/37971318218) réussies.

| Contrôle, dans chacune des deux CI | Résultat |
| --- | --- |
| Types, deux lints, build et couverture ciblée | Réussis |
| SQLite, suite unitaire et couverture | 1 539 tests / 182 fichiers |
| PostgreSQL | 1 538 réussis ; une exclusion native SQLite |
| Navigateur | 283 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité |

Ce candidat qualifie les douze contrôles de rattachement et les douze cas de concurrence des réservations, les 27 projections Client des détails Service et les seize protections Finance des commandes Opérations sur PostgreSQL réel. Les six E2E Finance passent sur les deux surfaces. Les [rapports](evidence/20261009-operations-order-finance/ci-0b6b8b3.json) vérifient les 948 entrées Git hors documentation avec la fusion de test PR. Les dix-neuf exclusions historiques du navigateur restent explicites ; aucun des six nouveaux E2E Finance ne fait partie des exclusions. Les [preuves de stock antérieures](evidence/20261009-stock-reservations/ci-88ce8dd.json) et de [facturation](evidence/20261009-invoice-actions/ci-de24513.json) restent conservées.

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

Le [lot de listes Commandes / Réservations](evidence/20261009-operations-list-volume/README.md), `67f90e8`, remplace les deux cartes plafonnées par des lecteurs paginés et autorisés avant total/recherche. Les commandes de stock sont réservées à Opérations en écriture, hors démo publique. Dix-neuf cas SQL et 1 558 tests / 183 fichiers passent localement, avec types, lints et compilation. Les quatre nouveaux parcours navigateur et les six Finance conservés sont chargés ; la qualification compilée se vérifie sur le candidat exact dans les [checks de la PR #8](https://github.com/lacombechristophe/freelio/pull/8/checks). Les tableaux du bootstrap et autres sélecteurs restent distincts.

La [revue CTO](revue-cto.md) donne un parcours de présentation et expose ces limites. Les résultats automatisés ne certifient ni tout le produit, ni l’accessibilité complète, ni les services externes.
