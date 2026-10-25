# Chantiers : portefeuille complet

Lot approuvé le 12 octobre 2026. Le diagnostic SQL précédent reproduit un 21e chantier cohérent absent du lecteur par défaut, limité à 20 ; la recherche et les filtres du tableau portent actuellement sur ces seuls résultats.

- Recherche serveur sur nom, client, agence et type de chantier ; filtres Tous / En cours / Terminé / Archivé conservés.
- Pages de 25, total et commandes précédent/suivant, avec ordre stable par création puis identifiant.
- Opérations en lecture, société du chantier et du client cohérentes, agences accessibles. Une agence ou un modèle liés d'une autre société excluent également la référence incohérente de ce lecteur ; les références nulles et inactives de la même société restent conservées. Le DTO ne contient ni caches financiers ni scores Client.
- Tableau, cartes mobiles, budgets opérationnels, statuts, dates civiles et commandes existantes conservés. Une recherche ou un échec ne réinitialise pas un formulaire déjà ouvert.

Les sélecteurs Client et Modèle, le détail du chantier et les mutations restent des lots distincts. La recette doit dépasser 20 et 25 chantiers, couvrir rôles/agences/sociétés et conserver la saisie dans le navigateur compilé.
