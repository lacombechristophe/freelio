# Listes complètes dans Automatisations — proposition

8 octobre 2026. Complément des journaux déjà approuvés. Lot explicitement approuvé par le propriétaire après présentation de ce contrat ; implémentation à venir.

## Limites reproduites dans les lecteurs

Le dashboard charge au maximum 100 modèles, 200 séquences, 200 scénarios et 100 adresses bloquées. Chaque séquence inclut seulement 20 inscriptions. Les recherches et filtres de ces studios portent sur ces tableaux ; ils ne peuvent retrouver une ligne absente. Le journal E-mails complet et le journal Scénarios ont leurs propres lecteurs et ne sont pas concernés par ce constat.

## Proposition visible

Porter les recherches et filtres actuels des studios Modèles, Séquences et Scénarios sur toutes les ressources accessibles, avec total et pages de 25. Ajouter les mêmes commandes près des inscriptions de la séquence sélectionnée et des adresses bloquées. Conserver le choix ouvert lorsque la recherche/page change, sans remplacer le contenu de son formulaire en cours. Conserver les cartes, commandes de création/édition/envoi, couleurs et disposition générale. Le périmètre historique/actif reste celui du studio existant ; ne pas réintroduire une archive dans une liste de création sans accord distinct.

Les lecteurs sont sous automation.read, société/agence et ACL actuelles. Count et page partagent une transaction et un ordre stable ; le détail et la sélection sont relus indépendamment de la page. Les données privées de boîte restent exclues. Une page devenue vide est recalée ; les erreurs ne donnent pas un ancien résultat comme s’il correspondait au nouveau filtre.

## Recette attendue

101 modèles, 201 séquences/scénarios, 101 suppressions et 21 inscriptions au minimum. Dernière ressource trouvée par recherche et page, filtres avant compte, sélection hors page conservée, révocation et société étrangère. Ordinateur/mobile : recherche, pages et formulaire resté intact. Types/lint/build, SQL SQLite/PostgreSQL et CI du SHA.

Ce lot ne clôture pas les autres sélecteurs CRM ni les statistiques générales, les préférences marketing, la banque ou les référentiels de L8. Aucune nouvelle exécution, reprise automatique, suppression de données ou connexion réelle n’est ajoutée.
