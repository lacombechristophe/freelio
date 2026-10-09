# Qualification du candidat Freelio

État du 9 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et le déploiement sont des références distinctes. Les résultats restent attachés au commit testé.

## Référence documentée en CI

**de24513** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/37911641818) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/37911648371) réussies.

| Contrôle, dans chacune des deux CI | Résultat |
| --- | --- |
| Types, deux lints, build et couverture ciblée | Réussis |
| SQLite, suite unitaire et couverture | 1 472 tests / 178 fichiers |
| PostgreSQL | 1 471 réussis ; une exclusion native SQLite |
| Navigateur | 277 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité |

Ce candidat qualifie aussi les actions de facturation : 34 cas SQL, neuf de relances et quatre de paiements concurrents. Les [rapports](evidence/20261009-invoice-actions/ci-de24513.json) vérifient l’identité des 942 entrées Git hors documentation avec la fusion de test PR. Documents et Récurrences conservent leurs 33 et 26 cas SQL, 13 cas worker, six et huit E2E. Les exclusions navigateur limitent certains anciens parcours mobiles ; les nouveaux tests de ces deux lots ne sont pas exclus. Les [preuves Documents antérieures](evidence/20261009-document-relations/ci-ae88e47.json) restent conservées.

## Portée du lot Récurrences

**565986e** implémente le [lot Récurrences approuvé](qualification-factures-recurrentes-20261009.md) : droits Finance, chantier relationnel, périmètre d’entretien et recherche/pagination complète. Sa [recette locale](evidence/20261009-recurring-read/local.json) passe 26 cas de périmètre, 13 cas worker et 33 cas Documents, puis 1 436 tests SQLite / 177 fichiers, types, lints et build de 75 pages. Le candidat 0f45087 qualifie ensuite ce code sur PostgreSQL et dans le navigateur compilé, avec les huit nouveaux E2E.

## Reproduire et examiner

Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Utiliser une copie isolée, les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les `.env`, données ou identifiants existants.

La [carte des preuves](carte-des-preuves.md) relie chaque invariant à ses tests et ses limites. Le [journal de recette](journal-recettes-completude-20261003.md) et les dossiers `evidence` conservent les diagnostics, échecs et qualifications antérieures. Une réussite ultérieure ne transforme pas un ancien run rouge en run vert. Un `playwright test --list` prouve seulement le chargement des tests ; les exécutions navigateur récentes proviennent de GitHub.

Les tests SQL utilisent les vraies actions et transactions selon leur périmètre ; les tests fournisseur utilisent HTTP simulé. Vérifier les mocks avant d’interpréter un résultat. Le [rapport de 10 000 exécutions](evidence/20261008-workflow-journal/README.md) décrit une mesure locale, pas une charge hébergée. Le contrôle de publication inspecte sources et historique sans garantir universellement l’absence de secret.

## Travaux encore nécessaires

Le correctif des [actions de facturation](evidence/20261009-invoice-actions/README.md), `e13d3d7`, passe localement 1 472 tests SQLite / 178 fichiers, types, lints et build. Les deux CI de de24513 qualifient ce correctif. Il couvre droits Finance explicites, société du client, calcul des avoirs cohérents et relecture des relances ; il ne ferme pas toute la chaîne financière. La [recette des réservations concurrentes](qualification-reservations-stock-20261009.md) passe douze cas SQLite, sans modification métier ; sa barrière PostgreSQL reste à qualifier.

- Compléter la qualification des autres écritures financières : remboursements, avoirs, réservations et contention forte. Les [paiements concurrents](qualification-paiements-concurrents-20261008.md) et les [rapprochements](qualification-rapprochements-bancaires-20261008.md) ont leurs propres preuves.
- Vérifier les traces et sorties des scénarios, les sélecteurs encore plafonnés et les chaînes métier restantes du [plan fonctionnel](plan-completude-fonctionnelle-20261002.md), puis installation, récupération et démonstrations de L9.
- Qualifier comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations sont hors recette fictive et budget de 0 €.

La [revue CTO](revue-cto.md) donne un parcours de présentation et expose ces limites. Les résultats automatisés ne certifient ni tout le produit, ni l’accessibilité complète, ni les services externes.
