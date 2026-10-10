# Organisation : accès aux devis et factures

## Défaut reproduit

Le lecteur `getOrganisationDashboardData` est authentifié, mais lit devis et factures sans leurs permissions de domaine. Une recette SQLite fictive utilisant les vraies adhésions, le DAL et l'action reproduit six divulgations : factures pour Sales, Operations, Service et Technician ; devis pour Service et Technician. Les relations appartiennent à la société et à une agence attribuée au membre : ce diagnostic isole le défaut de droit de domaine.

L'authentification et le cache Next sont simulés. Les tests ne créent aucun compte fournisseur et n'utilisent aucune donnée réelle. Le résultat attendu est une liste vide pour le domaine interdit, pas une liste masquée seulement dans le navigateur.

## Correction proposée

- Évaluer `finance.read` et `sales.read` avant les requêtes métier correspondantes ; ne pas exécuter ces requêtes sans le droit.
- Retourner des permissions explicites et des listes vides pour les domaines interdits. N'en dériver aucun montant, retard, compteur ou point de vigilance.
- Conserver les cartes et y afficher « Accès Finance requis » / « Accès commercial requis ». La carte de vigilance générale conserve les tâches bloquées accessibles.
- Pour les documents autorisés, conserver les scopes société/agence et exclure les clients d'une autre société. Aucun accès élargi par rapport au DAL.
- Conserver tâches, objectifs, temps et budgets opérationnels. Aucun changement de couleur, bouton ou disposition.

Le correctif visible attend l'accord du propriétaire. La correction du calendrier approuvée et sa qualification restent un lot distinct.

## Vérification attendue

Rejouer les six refus, puis Owner/Admin, Comptabilité, Viewer et les changements de rôle dans la même session. Vérifier l'absence d'appel aux lecteurs interdits, les clients incohérents et les agences non attribuées. Dans le navigateur compilé, conserver les cartes et les tâches accessibles, sans référence ou montant du domaine interdit. Les tests de calendrier doivent rester verts.
