# Corrections de qualification SQLite et budget CI — 7 octobre 2026

Le candidat Campagnes d132bea16d1d0d586a202c1187f77ef174fa55fe dispose de résultats distincts :

- [Push 37689801175](https://github.com/lacombechristophe/freelio/actions/runs/37689801175) : 128 E2E réussis, un échec et 19 exclusions historiques. Les deux nouveaux parcours Campagnes réussissent. Le parcours existant « field report and maintenance contract flow » reçoit un 503 de l’ordonnanceur ; ses tâches métier écrivent simultanément dans SQLite et produisent des erreurs P1008/transactions expirées.
- [PR 37689806995](https://github.com/lacombechristophe/freelio/actions/runs/37689806995) : 129 E2E réussis et 19 exclusions historiques ; types/lint/build/couverture et audit production passent. Le job atteint sa limite globale de 25 minutes et est déclaré annulé ; son étape d’audit complet a néanmoins échoué. Aucun de ces résultats n’est présenté comme une CI verte.
- PostgreSQL push : 717 tests réussis et une exclusion native SQLite sur 718. Linux push : neuf contrôles, 58 migrations, image sha256:1befd8c2476f28a73442673ef9da0f5c2bf9777c9d9b25a5e23aa0b6711d6429. Les artefacts téléchargés relient ces preuves au SHA testé.
- Le checkout PR b381df42f7aee4d1e52d94dfc849f8471531b837 a l’arbre 73dc498e05c9f20767eb2e18bcb07e7f246e2cd2, identique au commit d132bea. Les rapports UI PR ont zéro finding P0–P3 sur ordinateur/mobile.

## Ordonnanceur SQLite

Les six tâches métier s’exécutent désormais séquentiellement lorsque DATABASE_URL utilise file: ; PostgreSQL conserve le parallélisme. Aucun timeout transactionnel ni test n’est augmenté. Trois tests à portes contrôlées vérifient l’absence de seconde tâche avant libération de la première sous SQLite, le maintien du parallélisme PostgreSQL et la propagation d’un échec sans succès fabriqué. Les 14 tests ciblés ordonnanceur/attentes/reprise SQL passent. La correction doit encore obtenir sa propre CI navigateur.

## Normalisation des auteurs historiques

Le premier passage complet du lot Scénarios obtient 727 réussites et un échec : le test existant de 501 commandes historiques dépasse ses cinq secondes. La fonction exécutait chaque écriture dans sa propre transaction SQLite. Elle conserve les validations de payload, société, auteur, client/contact/boîte et la comparaison updatedAt ; elle valide désormais chaque lot borné de 100 dans une transaction, avec compteur retourné après commit. La pagination n’a aucun plafond total. Les 17 tests concernés passent ensuite (3,43 s pour les tests, 6,15 s avec chargement). Le timeout du test reste inchangé ; aucune qualification SIGKILL de ce backfill n’est déduite de cette recette.

## Durée du job CI

L’installation Chromium et de ses paquets système a pris 429 secondes sur le run PR, en plus de 676 secondes de parcours, 234 secondes de vérification et 119 secondes de couverture. La limite du job qualité passe de 25 à 35 minutes pour permettre l’audit complet et la publication des preuves. Il s’agit de la limite du job, pas du délai d’un test ou d’une transaction. Tous les contrôles, assertions, exclusions historiques et seuils d’audit restent identiques. L’audit complet demeure bloquant : cinq alertes hautes de développement, production zéro sur d132bea. Aucun merge ou déploiement de ce candidat.
