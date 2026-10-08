# Qualification du candidat Freelio

État du 8 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et la démo hébergée sont une livraison distincte. Les résultats ci-dessous ne constituent pas une certification du produit ou de ses fournisseurs.

## Dernière référence qualifiée fonctionnellement

La CI suivante de **e1e67f9**, qui ne changeait que la documentation, a reproduit une erreur React 418 dans Notifications. La réussite antérieure ci-dessous reste une preuve datée, pas une preuve d’absence de ce défaut intermittent. Le [correctif et sa qualification](qualification-notifications-20261008.md) sont préparés ; leur recette navigateur reste à exécuter sur le nouveau candidat.

**f5573b0d0696b832389a1c1ec0b2f9a18a94e23c** : listes complètes des studios, reprise humaine des séquences et correctif Next 16.3.8, avec les lots précédents. Les [CI push](https://github.com/lacombechristophe/freelio/actions/runs/37704659344) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/37704662879) sont achevées.

| Contrôle | Résultat |
| --- | --- |
| Types, lint, build et couverture ciblée | Réussis |
| SQLite | 809 tests / 150 fichiers |
| PostgreSQL | 808 réussis, une exclusion native SQLite |
| Navigateur | 139 réussis par run ; 19 exclusions historiques |
| Audit UI PR | 64 routes par format, zéro finding P0–P3 |
| Image Linux | Neuf contrôles ; 59 migrations ; PostgreSQL 18.6 ; UID 1000 |
| Audit production / complet | Zéro en production ; échec complet : cinq paquets hauts de développement |

Image testée : `sha256:0ad1b63a382465682685ad6b74fac28a4476e9b796273a431bf71db424ffd4f4`. Le checkout de fusion PR `e2fee95d00dc0093213240361311b72f3f6726e7` partage l’arbre `b9b6a4690fe1a3652f027772c8779e85e9cad8b1` du candidat, vérifié via GitHub et Git local. Les [preuves résumées](evidence/20261008-next-studios/README.md) conservent dépendances, runtime et contrôles ciblés. Les traces des autres versions restent dans le [journal historique](journal-recettes-completude-20261003.md).

## Portée des derniers lots

La reprise humaine des séquences est implémentée dans **38bd589**, avec contrat et preuves dans **1598302**. Localement : 800 tests SQLite / 149 fichiers, types/lint/build réussis. Les opérations vérifient sans émission, réparent l’historique avec inscription conservée en pause, ou classent avec motif/confirmation et arrêt de l’inscription. Leurs [règles et limites](contrat-reprise-humaine-sequences.md) expliquent notamment le thread vide possible après rollback et l’absence de progression implicite.

Les CI de 1598302 étaient interrompues avant SQLite/navigateur par les nouveaux avis Next. Les deux CI de f5573b0 qualifient désormais les parcours de reprise et de studios sur ordinateur/mobile ; leurs contrôles fonctionnels réussissent et seul l’audit complet échoue.

Le correctif minimal **16.3.8** est implémenté dans **e9c2519** : audits du lockfile et de l’installation physique, zéro vulnérabilité en production et cinq hautes de développement dans la chaîne braces. La [qualification Next](qualification-next-20261008.md) conserve les sources et versions. Les lectures complètes des studios et inscriptions sont [approuvées et implémentées](contrat-listes-automatisations-completes.md) dans **151007b**, après la désactivation des commandes de reprise en démo publique (**39bc392**). Recette locale commune : **809 tests SQLite / 150 fichiers**, types/lint réussis, build de 74 pages réussi. La découverte locale de 160 E2E / 36 fichiers reste distincte de leur exécution CI : 139 réussis et 19 exclus dans son environnement. Aucun navigateur local récent n’est annoncé exécuté.

## Comment reproduire les preuves

Utiliser une copie isolée avec les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les .env, données ou identifiants existants. Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Le journal historique conserve la référence de chaque exécution et ses corrections ; il ne sert pas de résultat courant.

Les tests SQL emploient les vraies actions, transactions et contrôles selon leur périmètre ; les tests fournisseur emploient HTTP simulé. Vérifier les mocks du fichier concerné avant d’interpréter son résultat. Un `playwright test --list` prouve uniquement le chargement des tests. Aucun navigateur local récent n’est annoncé exécuté ; les E2E récents proviennent de GitHub.

Le [rapport de volume](evidence/20261008-workflow-journal/README.md) donne le script, sa version, son empreinte, le moteur et les mesures de 10 000 exécutions. Le contrôle de publication inspecte sources et blobs historiques, mais ne garantit pas universellement l’absence de secret. Ces contrôles ne démontrent ni charge hébergée, ni fournisseur réel, ni SIGKILL pendant un commit.

## Ce qui reste à fermer

- Audit complet sans alerte bloquante et CI propre du candidat final. Aucun seuil réduit ou contrôle retiré.
- Banque : [historique et correspondances](contrat-banque-listes-completes.md) et [dates impossibles d’import](contrat-banque-dates-import.md), approuvés et implémentés, avec recette navigateur/CI du candidat à qualifier. Le conflit d’import simultané est reproduit séparément sur SQLite fictive, sans correction annoncée.
- Autres sélecteurs encore plafonnés, préférences Marketing, référentiels et chaînes métier de L8 ; installation/récupération et trois démonstrations de L9.
- Qualification de comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations restent hors recette fictive et budget de 0 €.

Le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md) détaille ces travaux. La [carte des preuves](carte-des-preuves.md) relie les risques aux fichiers de test ; la [revue CTO](revue-cto.md) donne le parcours de présentation. Les décisions d’interface déjà approuvées sont conservées dans leurs contrats.
