# Suivi client : accès aux mesures financières

Lot approuvé le 8 octobre 2026, en cours de qualification. La matrice des rôles reste inchangée. Le complément Annuaire possède sa propre qualification.

## Défaut reproduit

Le lecteur `getCustomerSuccessWorkspace` exige `service.read`, mais retourne montant de renouvellement et encours échu aux rôles Technicien et SAV sans `finance.read`. Cinq cas utilisent les vraies adhésions, agences, actions, DAL et transactions SQLite ; session et cache Next sont simulés. Le cas Owner passe et les quatre assertions de restriction échouent. La recette emploie une société et des valeurs fictives, puis les supprime. Son [reproducer et ses empreintes](evidence/20261008-customer-success-permissions/README.md) sont séparés de la suite verte.

## Comportement approuvé et implémenté

- Sans `finance.read`, ne pas interroger les factures pour les mesures de ce portefeuille. Retourner `null` pour encours et montant de renouvellement, afficher « Accès Finance requis » à leur place et ne pas exposer les valeurs dans les facteurs de santé.
- Calculer scores, filtres, ordre et compteurs de ce portefeuille sur les seules mesures accessibles ; exclure les factures de la dernière activité sans droit Finance. La mention « Score calculé sur les mesures accessibles » précise ce périmètre. Ne pas retourner les scores globaux historiques susceptibles d’intégrer les finances ; afficher « Historique global indisponible » à la place de leur tendance pour ces rôles.

- Rendre la mesure et les règles financières indisponibles sans les droits Finance correspondants. Leur modification exige `service.write` et `finance.write`, y compris dans l’installation des règles recommandées ; les règles opérationnelles restent disponibles selon les droits existants.
- Le champ de renouvellement est modifiable seulement avec `service.write` et `finance.write`. Une sauvegarde des autres champs conserve son montant existant ; une tentative directe de modification non autorisée est refusée. Avec lecture Finance mais sans écriture, le montant reste lisible et le champ est désactivé.
- Les lecteurs autorisés conservent les montants, avec filtrage explicite de société/projet/agence des factures. Le recalcul global administrateur reste distinct de cette projection de lecture. Couleurs, cartes et disposition sont conservées ; les écritures restent interdites en démo publique.

Un relevé global ne sert pas non plus de tendance à une projection limitée à des agences : aucun historique local n’est inventé. Les tests incluent le rôle Viewer avec lecture Finance et périmètre d’agence.

## Qualification attendue

Étendre la même régression aux facteurs, comparaisons de statut, compteurs, dernières activités, historiques, sauvegardes sans perte du montant, règles recommandées, droits retirés et frontières de société/agence. Exécuter SQL SQLite/PostgreSQL et parcours Owner/Technicien/SAV sur ordinateur/mobile. Un test qui masque seulement le HTML ne suffit pas.

Ce lot ne qualifie pas les scores partagés dans les autres annuaires, les rapports Service, les contrats de maintenance, tous les champs libres ni l’ensemble du CRM. Le nouveau défaut ne retire pas les preuves obtenues par la fiche ou l’annuaire Client, et interdit d’annoncer une clôture globale des droits.
