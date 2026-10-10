# Scores globaux dans les lecteurs partagés

## Défaut reproduit

Sur `bf8b6ee463cf2721dfc08a3fab24ddfaf975c92b`, une recette SQLite isolée de 21 cas donne 17 échecs et quatre réussites. Les lecteurs Client, l’annuaire et les espaces CRM/Service renvoient le score global ou ses cohortes à Technicien, SAV et Viewer limité à des agences. Automatisations renvoie aussi le score dans ses choix de client à Sales et SAV. Les contrôles positifs Owner et la suspension passent. Les actions, le DAL et les requêtes SQL sont réels ; session/cache Next seuls sont simulés. La [preuve](evidence/20261008-shared-health-permissions/README.md) reste une régression échouée.

Le score stocké peut intégrer des règles financières et des agences hors périmètre. Son statut, son classement et sa variation sont également des informations dérivées. Il ne doit pas être présenté comme un score calculé sur les seules mesures accessibles.

## Lot approuvé

Dans l’annuaire Client, son CSV et la fiche, remplacer le score inaccessible par « Historique global indisponible », sans pourcentage, barre ou couleur déduite du score. Conserver les colonnes et la carte. Les filtres et tris ne peuvent pas utiliser le score caché ; ils suivent la valeur indisponible, comme les montants financiers déjà restreints.

Dans les espaces CRM/Service, conserver les cartes de santé avec la même mention, sans cohortes. Les dossiers récents restent accessibles selon leurs droits, mais sans score, statut ou classement déduit de ce score. Le critère d’accès au score global est Finance et un périmètre de société complet ; Owner/Admin le conservent. Ce lot ne recalcule pas un nouveau score partiel.

Dans le choix du client de simulation d’Automatisations, afficher la même mention à la place du score inaccessible. Refuser côté serveur la simulation d’un scénario de santé global pour ces rôles ; conserver la commande avec une explication. Les simulations de prospects restent inchangées. Les couleurs existantes hors informations dérivées et la disposition générale sont conservées ; aucun nouveau bouton ou envoi.

## Vérifications attendues

Étendre la régression aux contrôles positifs Admin, aux rôles supplémentaires, aux filtres/tri/CSV, à l’absence de projection SQL du score lorsque possible, aux variations historiques et à la simulation directe par identifiant. Rejouer SQLite/PostgreSQL, puis vérifier ordinateur/mobile sur des sociétés fictives isolées. Aucune permission ou donnée persistée n’est modifiée pour masquer le défaut.

Les autres données financières et commerciales des tableaux de bord, leurs périmètres d’agence, ainsi que les traces et sorties des scénarios de santé demandent des contrôles distincts. La correction des seuls lecteurs ne prouve pas l’absence de divulgation par une tâche ou une notification historique. Les automatismes de santé et leur diffusion devront être qualifiés avant livraison commerciale.

Statut : approuvé et implémenté le 8 octobre. Les 65 cas étendus passent en SQLite, avec les anciennes restrictions Client conservées. Les vingt parcours navigateur ajoutés et la CI propre au candidat restent à qualifier ; les résultats initiaux échoués sont conservés.
