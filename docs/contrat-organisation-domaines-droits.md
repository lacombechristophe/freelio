# Organisation : accès aux devis et factures

## Défaut reproduit

Le lecteur `getOrganisationDashboardData` est authentifié, mais lit devis et factures sans leurs permissions de domaine. Une recette SQLite fictive utilisant les vraies adhésions, le DAL et l'action reproduit six divulgations : factures pour Sales, Operations, Service et Technician ; devis pour Service et Technician. Les relations appartiennent à la société et à une agence attribuée au membre : ce diagnostic isole le défaut de droit de domaine.

L'authentification et le cache Next sont simulés. Les tests ne créent aucun compte fournisseur et n'utilisent aucune donnée réelle. Le résultat attendu est une liste vide pour le domaine interdit, pas une liste masquée seulement dans le navigateur.

## Correction approuvée

- Évaluer `finance.read` et `sales.read` avant les requêtes métier correspondantes ; ne pas exécuter ces requêtes sans le droit.
- Retourner des permissions explicites et des listes vides pour les domaines interdits. N'en dériver aucun montant, retard, compteur ou point de vigilance.
- Conserver les cartes et y afficher « Accès Finance requis » / « Accès commercial requis ». La carte de vigilance générale conserve les tâches bloquées accessibles.
- Pour les documents autorisés, conserver les scopes société/agence et exclure les clients d'une autre société. Aucun accès élargi par rapport au DAL.
- Conserver tâches, objectifs, temps et budgets opérationnels. Aucun changement de couleur, bouton ou disposition.

Le propriétaire approuve ce lot le 10 octobre 2026. Les permissions sont évaluées dans l'action, avant les requêtes ; les cartes utilisent ces permissions explicites. La correction du calendrier et sa qualification restent un lot distinct.

## Vérification

`tests/unit/organisation-domain-scope.integration.test.ts` couvre les six refus, Owner/Admin, Comptabilité, Viewer, Sales/Operations et le changement de rôle dans la même session. Les appels interdits sont surveillés ; clients étrangers, autres sociétés, agences non attribuées et révocation d'agence utilisent de vraies lignes SQL. Un cas conserve explicitement tâches, objectifs, temps et budgets opérationnels. Seuls l'authentification et le cache Next sont simulés.

`tests/e2e/organisation-permissions.spec.ts` couvre Service, Sales et Comptabilité sur ordinateur et mobile : mentions dans les cartes, absence de références interdites dans le HTML serveur, vigilance calculée sur les seules données accessibles et conservation des tâches/objectifs. Le seed associé utilise une société fictive par surface, uniquement dans la recette isolée. Les résultats locaux et CI sont consignés séparément ; le chargement des E2E ne vaut pas leur exécution.

La [recette locale](evidence/20261010-preview-readiness/organisation-domain-local.json) passe quinze cas SQL dédiés, les seize calendriers conservés, puis la suite de 1 672 tests / 192 fichiers, types, deux lints et build. La date de la ligne de temps fictive est ensuite alignée sur le jour civil de Paris pour éviter une dépendance à l'heure du dimanche soir ; les 31 cas ciblés et le lint du fichier sont rejoués avec succès. Aucun code applicatif ne change après le build. Le nouveau seed passe aussi sur une base SQLite neuve. Les six E2E Organisation sont chargés, pas exécutés localement.

Les [deux CI de 021bfac](evidence/20261010-preview-readiness/ci-021bfac.json) passent les quinze cas SQL Organisation sur PostgreSQL et les six E2E sur ordinateur/mobile. Le workflow complet reste rouge : un autre E2E propose un rendez-vous à une date passée et reçoit le refus HTTP 400 attendu. Les rapports conservent cet échec ; les succès ciblés ne qualifient pas l'ensemble du candidat.

Les [deux CI de d82ed46](evidence/20261010-preview-readiness/ci-d82ed46.json) passent ensuite la suite complète, dont les quinze cas Organisation PostgreSQL et ses six E2E. Le rendez-vous du portail passe avec sa fixture future et les assertions existantes conservées. Les résultats rouges de 021bfac restent conservés.
