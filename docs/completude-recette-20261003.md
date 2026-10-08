# Qualification du candidat Freelio

État du 8 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et la démo hébergée sont une livraison distincte. Les résultats ci-dessous ne constituent pas une certification du produit ou de ses fournisseurs.

Le candidat complète les historiques Fournisseurs, l’import et les rapprochements bancaires, puis les droits Sales/Finance de la fiche et de l’annuaire Client. La recette locale commune réussit **987 tests / 161 fichiers**, types et les deux moteurs de lint, schémas SQLite/PostgreSQL et build de 75 pages. Les 188 E2E / 41 fichiers sont découverts, leur exécution reste en CI. Les [quatre courses de paiements manuels](qualification-paiements-concurrents-20261008.md) sont ajoutées sans changement de code métier ; leur barrière de concurrence PostgreSQL reste à exécuter.

La [preuve PostgreSQL bancaire avant/après](qualification-rapprochements-bancaires-20261008.md) reproduit quatre courses puis leur correction sur e0726f6. Le débordement Fournisseur de 41238b0 est corrigé : la CI de PR 5b72db6 réussit, sa CI de branche échoue ailleurs. Sur 3be747d, les deux CI passent PostgreSQL et Linux mais échouent sur quatre sélecteurs du nouveau test Client : « Créer un devis » expose le rôle bouton. Le sélecteur est corrigé sans modifier le produit ni assouplir d’assertion. Les [qualifications Fournisseurs](qualification-fournisseurs-historiques-20261008.md) et [Client](qualification-fiche-client-droits-20261008.md) conservent ces résultats. Le nouveau candidat doit réussir ses deux CI ; main et le déploiement restent inchangés.

## Dernière référence entièrement verte en CI

La fiche Client reproduit douze échecs avant correction, puis dix-sept réussites en SQLite et PostgreSQL sur 3be747d. Le [complément approuvé d’annuaire et CSV](qualification-annuaire-client-droits-20261008.md) reproduit vingt échecs sur trente cas avant correction, puis trente réussites en SQLite ; PostgreSQL et ses six parcours CSV restent à qualifier. Les preuves CI de la référence ci-dessous ne sont pas attribuées à ces changements.

**1e5e3bcdf67fdfb1e6a1abb6906e0773e95e9885** : gestion des fournisseurs, frontières d’agence, récupération du CSV et préparation des studios par lots. La [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37773059619) et la [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37773066937) réussissent.

| Contrôle | Résultat de branche |
| --- | --- |
| Types, deux moteurs de lint, build et couverture ciblée | Réussis |
| SQLite | 907 tests / 155 fichiers |
| PostgreSQL | 906 réussis, une exclusion native SQLite |
| Navigateur | 151 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audit production / complet | Zéro vulnérabilité |

La [qualification Banque/Fournisseurs](qualification-banque-fournisseurs-20261008.md) conserve l’échec du CSV sur la PR ff3b0f3, sa correction et les résultats ultérieurs. Les [preuves historiques Next/studios](evidence/20261008-next-studios/README.md) et le [journal](journal-recettes-completude-20261003.md) conservent leurs versions et leurs limites. Aucun résultat antérieur n’est attribué aux nouveaux historiques ou à l’import concurrent.

## Portée des derniers lots

La reprise humaine des séquences est implémentée dans **38bd589**, avec contrat et preuves dans **1598302**. Localement : 800 tests SQLite / 149 fichiers, types/lint/build réussis. Les opérations vérifient sans émission, réparent l’historique avec inscription conservée en pause, ou classent avec motif/confirmation et arrêt de l’inscription. Leurs [règles et limites](contrat-reprise-humaine-sequences.md) expliquent notamment le thread vide possible après rollback et l’absence de progression implicite.

Les CI de 1598302 étaient interrompues avant SQLite/navigateur par les nouveaux avis Next. Les deux CI de f5573b0 qualifient désormais les parcours de reprise et de studios sur ordinateur/mobile ; leurs contrôles fonctionnels réussissent et seul l’audit complet échoue.

Le correctif minimal **16.3.8** est implémenté dans **e9c2519** : audits du lockfile et de l’installation physique, zéro vulnérabilité en production et cinq hautes de développement dans la chaîne braces. La [qualification Next](qualification-next-20261008.md) conserve les sources et versions. Les lectures complètes des studios et inscriptions sont [approuvées et implémentées](contrat-listes-automatisations-completes.md) dans **151007b**, après la désactivation des commandes de reprise en démo publique (**39bc392**). Recette locale commune : **809 tests SQLite / 150 fichiers**, types/lint réussis, build de 74 pages réussi. La découverte locale de 160 E2E / 36 fichiers reste distincte de leur exécution CI : 139 réussis et 19 exclus dans son environnement. Aucun navigateur local récent n’est annoncé exécuté.

## Comment reproduire les preuves

Utiliser une copie isolée avec les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les .env, données ou identifiants existants. Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Le journal historique conserve la référence de chaque exécution et ses corrections ; il ne sert pas de résultat courant.

Les tests SQL emploient les vraies actions, transactions et contrôles selon leur périmètre ; les tests fournisseur emploient HTTP simulé. Vérifier les mocks du fichier concerné avant d’interpréter son résultat. Un `playwright test --list` prouve uniquement le chargement des tests. Aucun navigateur local récent n’est annoncé exécuté ; les E2E récents proviennent de GitHub.

Le [rapport de volume](evidence/20261008-workflow-journal/README.md) donne le script, sa version, son empreinte, le moteur et les mesures de 10 000 exécutions. Le contrôle de publication inspecte sources et blobs historiques, mais ne garantit pas universellement l’absence de secret. Ces contrôles ne démontrent ni charge hébergée, ni fournisseur réel, ni SIGKILL pendant un commit.

## Ce qui reste à fermer

- CI propre du candidat final, incluant les historiques Fournisseurs, les imports et rapprochements concurrents et l’isolation des fixtures. La [séparation des règles Next](../tooling/lint/README.md) retire la chaîne vulnérable : les [audits locaux](evidence/20261008-lint-policy/README.md) du lockfile et de l’installation donnent zéro alerte, sans seuil réduit ni contrôle retiré.
- Banque : historique, correspondances, dates impossibles et récupération du CSV qualifiés par 1e5e3bc ; [import concurrent](qualification-import-bancaire-concurrent-20261008.md) et [trois rapprochements](qualification-rapprochements-bancaires-20261008.md) passent PostgreSQL. Autres entrées de paiement, remboursements, avoirs, réservations et stress restent à qualifier.
- Fournisseurs : [lot approuvé et implémenté](contrat-fournisseurs-gestion.md), qualifié en CI ; [historiques et indicateurs](contrat-fournisseurs-historiques.md) approuvés et en qualification. Autres sélecteurs encore plafonnés, préférences Marketing, référentiels et chaînes métier de L8 ; installation/récupération et trois démonstrations de L9.
- Qualification de comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations restent hors recette fictive et budget de 0 €.

Le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md) détaille ces travaux. La [carte des preuves](carte-des-preuves.md) relie les risques aux fichiers de test ; la [revue CTO](revue-cto.md) donne le parcours de présentation. Les décisions d’interface déjà approuvées sont conservées dans leurs contrats.
