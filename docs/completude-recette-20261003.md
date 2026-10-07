# Qualification du candidat Freelio

État du 8 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et la démo hébergée sont une livraison distincte. Les résultats ci-dessous ne constituent pas une certification du produit ou de ses fournisseurs.

## Dernière référence qualifiée fonctionnellement

**6cc3d8a9d3c1c421303a3e76a49df90c78d89170** : journal E-mails complet, protection des relances incertaines et droits Banque/Comptabilité. Les [CI push](https://github.com/lacombechristophe/freelio/actions/runs/37700641265) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/37700645951) sont achevées.

| Contrôle | Résultat |
| --- | --- |
| Types, lint, build et couverture ciblée | Réussis |
| SQLite | 782 tests / 148 fichiers |
| PostgreSQL | 781 réussis, une exclusion native SQLite |
| Navigateur | 135 réussis par run ; 19 exclusions historiques |
| Audit UI PR | 64 routes par format, zéro finding P0–P3 |
| Image Linux | Neuf contrôles ; 59 migrations ; PostgreSQL 18.6 ; UID 1000 |
| Audit complet | Échec : six paquets hauts au moment du run |

Image testée : `sha256:3df716ca10eee400b461becbeccf4f64c51e983f29ec5788c1bfcf67bab2e401`. Le checkout de fusion PR `2bf64b3b5cea3025517bb369ee78541f5d724558` partage l’arbre `ac9093ec02118d978f99408d390fcf3bb75e298a` du candidat, vérifié via GitHub et Git local. Les traces des autres versions restent dans le [journal historique](journal-recettes-completude-20261003.md).

## Ajouts suivants

La reprise humaine des séquences est implémentée dans **38bd589**, avec contrat et preuves dans **1598302**. Localement : 800 tests SQLite / 149 fichiers, types/lint/build réussis. Les opérations vérifient sans émission, réparent l’historique avec inscription conservée en pause, ou classent avec motif/confirmation et arrêt de l’inscription. Leurs [règles et limites](contrat-reprise-humaine-sequences.md) expliquent notamment le thread vide possible après rollback et l’absence de progression implicite.

Les CI [push](https://github.com/lacombechristophe/freelio/actions/runs/37702825363) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/37702831865) de 1598302 échouent au contrôle de dépendances de production avant les recettes SQLite/navigateur. PostgreSQL et Linux réussissent ; les nouveaux E2E de reprise ne sont donc pas encore qualifiés.

Le contrôle courant détecte des avis Next.js publiés après le précédent résultat de production. Le correctif minimal **16.3.8** est implémenté dans **e9c2519** : audits du lockfile et de l’installation physique, zéro vulnérabilité en production et cinq hautes de développement dans la chaîne braces. La [qualification Next](qualification-next-20261008.md) conserve les sources et versions. Les lectures complètes des studios et inscriptions sont [approuvées et implémentées](contrat-listes-automatisations-completes.md) dans **151007b**, après la désactivation des commandes de reprise en démo publique (**39bc392**). Recette locale commune : **809 tests SQLite / 150 fichiers**, types/lint réussis, build de 74 pages réussi. 160 E2E / 36 fichiers sont découverts ; ils ne sont pas annoncés exécutés localement. La CI du prochain candidat devra couvrir ces ajouts ensemble.

## Comment reproduire les preuves

Utiliser une copie isolée avec les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les .env, données ou identifiants existants. Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Le journal historique conserve la référence de chaque exécution et ses corrections ; il ne sert pas de résultat courant.

Les tests SQL emploient les vraies actions, transactions et contrôles selon leur périmètre ; les tests fournisseur emploient HTTP simulé. Vérifier les mocks du fichier concerné avant d’interpréter son résultat. Un `playwright test --list` prouve uniquement le chargement des tests. Aucun navigateur local récent n’est annoncé exécuté ; les E2E récents proviennent de GitHub.

Le [rapport de volume](evidence/20261008-workflow-journal/README.md) donne le script, sa version, son empreinte, le moteur et les mesures de 10 000 exécutions. Le contrôle de publication inspecte sources et blobs historiques, mais ne garantit pas universellement l’absence de secret. Ces contrôles ne démontrent ni charge hébergée, ni fournisseur réel, ni SIGKILL pendant un commit.

## Ce qui reste à fermer

- Audit complet sans alerte bloquante et CI propre du candidat final. Aucun seuil réduit ou contrôle retiré.
- Recette des listes complètes et reprise des séquences sur ordinateur/mobile, PostgreSQL et Linux.
- Autres sélecteurs encore plafonnés, préférences Marketing, référentiels et chaînes métier de L8 ; installation/récupération et trois démonstrations de L9.
- Qualification de comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations restent hors recette fictive et budget de 0 €.

Le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md) détaille ces travaux. La [carte des preuves](carte-des-preuves.md) relie les risques aux fichiers de test ; la [revue CTO](revue-cto.md) donne le parcours de présentation. Les décisions d’interface déjà approuvées sont conservées dans leurs contrats.
