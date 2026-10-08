# Fiche fournisseur : historiques et indicateurs — proposition

Complément de CRM-01 / L8, distinct de l’annuaire et de l’édition approuvés. La fiche ne lit que 300 produits et 100 commandes/retours. Ses cartes calculent achats cumulés, ponctualité, anomalies et nombre de références sur ces tranches. Les accès d’agence sont corrigés séparément ; une permission correcte ne rend pas ces indicateurs complets.

## Lot visible proposé

- Calculer les quatre cartes sur tous les rattachements accessibles, indépendamment de la recherche et des pages.
- Dans Catalogue fournisseur, Historique des commandes et Retours et avoirs, ajouter une recherche et les commandes de pagination existantes, par 25, avec total et numéro de page.
- Conserver les cartes, leurs couleurs, les colonnes générales et les liens actuels. Ne pas ajouter de suppression, d’envoi ou de mutation.

Chaque bloc conserve sa recherche et sa page indépendamment des deux autres. Les résultats périmés sont masqués pendant l’actualisation ; une erreur ne se présente pas comme une liste vide. Le retour à la page précédente reste possible. Une recherche ne modifie pas les quatre indicateurs globaux.

## Contrat serveur

Actions sous operations.read avec membership et agences actuels, fournisseur relu dans la société. Les produits restent partagés ; leur stock est filtré par entrepôts accessibles. Les commandes et retours gardent les frontières explicites par chantier, entrepôt et société. Les lecteurs bornent requêtes/pages, comptent après filtres, ordonnent avec un identifiant stable et ne transportent que la page demandée.

Les indicateurs distinguent commandes annulées, commandes réceptionnées, échéance confirmée ou prévue et anomalies non résolues selon les règles actuelles. Leur calcul complet ne change pas ces définitions. Les prix historiques non affichés et la concurrence financière restent hors lot.

## Recette attendue

Au moins 301 produits et 101 commandes/retours fictifs ; accès à l’ancien résultat par recherche et dernière page, cartes invariantes pendant les filtres et exactitude contre les lignes SQL. Autre société/agence, révocation, rôle et démo publique. Parcours ordinateur/mobile, états vide/erreur/chargement et conservation des trois recherches. Aucun compte ou fournisseur réel.
