# Qualification du candidat Freelio

État du 8 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et la démo hébergée sont une livraison distincte. Les résultats ci-dessous ne constituent pas une certification du produit ou de ses fournisseurs.

Le candidat courant ajoute la gestion Fournisseurs approuvée, corrige les lectures de stock et d’historique par agence et récupère un CSV choisi avant l’attachement des gestionnaires du client. Sa [qualification locale](qualification-banque-fournisseurs-20261008.md) passe 907 tests SQLite, types, les deux moteurs de lint et le build de 75 pages. Les nouveaux parcours navigateur restent à qualifier en CI. Main et le déploiement restent inchangés.

## Dernière référence exécutée en CI

**ff3b0f3c321d003fa719152d4e8de45cabc5d435** : Banque, notifications et retrait de la chaîne de lint vulnérable. La [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37767742082) réussit, mais la [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37767747724) échoue sur le dépôt CSV ordinateur. Cette référence n’est donc pas une livraison entièrement qualifiée.

| Contrôle | Résultat |
| --- | --- |
| Types, deux moteurs de lint, build et couverture ciblée | Réussis |
| SQLite | 875 tests / 153 fichiers |
| PostgreSQL | 874 réussis, une exclusion native SQLite |
| Navigateur de branche | 145 réussis ; 19 exclusions historiques |
| Navigateur de PR | Échec du dépôt CSV ordinateur ; correctif en recette |
| Image Linux | Neuf contrôles réussis |
| Audit production / complet de branche | Zéro vulnérabilité |

La [qualification](qualification-banque-fournisseurs-20261008.md) distingue les deux exécutions et le correctif. Les [preuves historiques Next/studios](evidence/20261008-next-studios/README.md) et le [journal](journal-recettes-completude-20261003.md) conservent leurs versions et leurs limites. Le résultat f5573b0 et son audit complet rouge ne sont pas attribués au candidat actuel.

## Portée des derniers lots

La reprise humaine des séquences est implémentée dans **38bd589**, avec contrat et preuves dans **1598302**. Localement : 800 tests SQLite / 149 fichiers, types/lint/build réussis. Les opérations vérifient sans émission, réparent l’historique avec inscription conservée en pause, ou classent avec motif/confirmation et arrêt de l’inscription. Leurs [règles et limites](contrat-reprise-humaine-sequences.md) expliquent notamment le thread vide possible après rollback et l’absence de progression implicite.

Les CI de 1598302 étaient interrompues avant SQLite/navigateur par les nouveaux avis Next. Les deux CI de f5573b0 qualifient désormais les parcours de reprise et de studios sur ordinateur/mobile ; leurs contrôles fonctionnels réussissent et seul l’audit complet échoue.

Le correctif minimal **16.3.8** est implémenté dans **e9c2519** : audits du lockfile et de l’installation physique, zéro vulnérabilité en production et cinq hautes de développement dans la chaîne braces. La [qualification Next](qualification-next-20261008.md) conserve les sources et versions. Les lectures complètes des studios et inscriptions sont [approuvées et implémentées](contrat-listes-automatisations-completes.md) dans **151007b**, après la désactivation des commandes de reprise en démo publique (**39bc392**). Recette locale commune : **809 tests SQLite / 150 fichiers**, types/lint réussis, build de 74 pages réussi. La découverte locale de 160 E2E / 36 fichiers reste distincte de leur exécution CI : 139 réussis et 19 exclus dans son environnement. Aucun navigateur local récent n’est annoncé exécuté.

## Comment reproduire les preuves

Utiliser une copie isolée avec les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les .env, données ou identifiants existants. Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Le journal historique conserve la référence de chaque exécution et ses corrections ; il ne sert pas de résultat courant.

Les tests SQL emploient les vraies actions, transactions et contrôles selon leur périmètre ; les tests fournisseur emploient HTTP simulé. Vérifier les mocks du fichier concerné avant d’interpréter son résultat. Un `playwright test --list` prouve uniquement le chargement des tests. Aucun navigateur local récent n’est annoncé exécuté ; les E2E récents proviennent de GitHub.

Le [rapport de volume](evidence/20261008-workflow-journal/README.md) donne le script, sa version, son empreinte, le moteur et les mesures de 10 000 exécutions. Le contrôle de publication inspecte sources et blobs historiques, mais ne garantit pas universellement l’absence de secret. Ces contrôles ne démontrent ni charge hébergée, ni fournisseur réel, ni SIGKILL pendant un commit.

## Ce qui reste à fermer

- CI propre du candidat final, incluant Fournisseurs et récupération du CSV. La [séparation des règles Next](../tooling/lint/README.md) retire la chaîne vulnérable : les [audits locaux](evidence/20261008-lint-policy/README.md) du lockfile et de l’installation donnent désormais zéro alerte, sans seuil réduit ni contrôle retiré. La qualification du nouveau commit reste requise.
- Banque : [historique et correspondances](contrat-banque-listes-completes.md) et [dates impossibles d’import](contrat-banque-dates-import.md), approuvés et implémentés, avec recette navigateur/CI du candidat à qualifier. Le conflit d’import simultané est reproduit séparément sur SQLite fictive, sans correction annoncée.
- Fournisseurs : [lot approuvé et implémenté](contrat-fournisseurs-gestion.md), avec CI navigateur restante. Autres sélecteurs encore plafonnés, préférences Marketing, référentiels et chaînes métier de L8 ; installation/récupération et trois démonstrations de L9.
- Qualification de comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations restent hors recette fictive et budget de 0 €.

Le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md) détaille ces travaux. La [carte des preuves](carte-des-preuves.md) relie les risques aux fichiers de test ; la [revue CTO](revue-cto.md) donne le parcours de présentation. Les décisions d’interface déjà approuvées sont conservées dans leurs contrats.
