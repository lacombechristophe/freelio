# Listes complètes dans Automatisations

8 octobre 2026. Complément des journaux déjà approuvés. Lot explicitement approuvé par le propriétaire après présentation de ce contrat, puis implémenté dans le candidat de la PR #8.

## Limites reproduites dans les lecteurs

Le dashboard charge au maximum 100 modèles, 200 séquences, 200 scénarios et 100 adresses bloquées. Chaque séquence inclut seulement 20 inscriptions. Les recherches et filtres de ces studios portent sur ces tableaux ; ils ne peuvent retrouver une ligne absente. Le journal E-mails complet et le journal Scénarios ont leurs propres lecteurs et ne sont pas concernés par ce constat.

## Proposition visible

Porter les recherches et filtres actuels des studios Modèles, Séquences et Scénarios sur toutes les ressources accessibles, avec total et pages de 25. Ajouter les mêmes commandes près des inscriptions de la séquence sélectionnée et des adresses bloquées. Conserver le choix ouvert lorsque la recherche/page change, sans remplacer le contenu de son formulaire en cours. Conserver les cartes, commandes de création/édition/envoi, couleurs et disposition générale. Le périmètre historique/actif reste celui du studio existant ; ne pas réintroduire une archive dans une liste de création sans accord distinct.

Les lecteurs sont sous automation.read, société/agence et ACL actuelles. Count et page partagent une transaction et un ordre stable ; le détail et la sélection sont relus indépendamment de la page. Les données privées de boîte restent exclues. Une page devenue vide est recalée ; les erreurs ne donnent pas un ancien résultat comme s’il correspondait au nouveau filtre.

## Recette attendue

101 modèles, 201 séquences/scénarios, 101 suppressions et 21 inscriptions au minimum. Dernière ressource trouvée par recherche et page, filtres avant compte, sélection hors page conservée, révocation et société étrangère. Ordinateur/mobile : recherche, pages et formulaire resté intact. Types/lint/build, SQL SQLite/PostgreSQL et CI du SHA.

Ce lot ne clôture pas les autres sélecteurs CRM ni les statistiques générales, les préférences marketing, la banque ou les référentiels de L8. Aucune nouvelle exécution, reprise automatique, suppression de données ou connexion réelle n’est ajoutée.

## Implémentation et preuve locale

`src/lib/automations/studio-readers.ts` contient cinq lecteurs paginés ; les actions conservent les contrôles réels et les studios utilisent ces lecteurs. La sélection reste indépendante de la page et les totaux de cartes ne dépendent plus de la première tranche. Les historiques de tâche d’une inscription sont relus par le modèle protégé : une tâche de calendrier privé inaccessible n’est pas exposée. Le chargement initial du dashboard conserve aussi cette restriction.

Neuf tests SQL utilisent 101 modèles, 201 séquences et scénarios, 101 suppressions et 26 inscriptions, avec authentification simulée et vraies actions/permissions/transactions. Ils vérifient les filtres, dernières pages, sélection hors filtre, compte actif complet, boîtes privées, révocation et sociétés étrangères. La suite SQLite complète passe : 809 tests dans 150 fichiers. Types et lint passent. `tests/e2e/automation-studios.spec.ts` ajoute les parcours ordinateur/mobile de pagination et conservation de saisie ; leur découverte ne prouve pas leur exécution. Les résultats build et CI sont consignés dans l’[index de qualification](completude-recette-20261003.md).

Les sélecteurs utilisés ailleurs conservent leurs limites antérieures : ce changement ne réduit pas leurs données à la page courante et ne prétend pas les rendre complets. Les archives restent hors des listes actives existantes.
