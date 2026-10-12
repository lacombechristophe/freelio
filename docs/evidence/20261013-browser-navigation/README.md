# Attendre le résultat réel d'une action compilée

Les CI de `1586c1b` sont annulées au plafond de 35 minutes : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38317716890), [PR](https://github.com/lacombechristophe/freelio/actions/runs/38317721467). SQLite (1 944 tests), PostgreSQL (1 943 réussis, une exclusion native SQLite), neuf contrôles Linux et les deux audits passent dans chaque run. La suite navigateur reste incomplète.

Les traces identifient quatre échecs desktop de facturation des temps. Leur attente `factures/[^/]+` acceptait la page initiale `factures/temps-non-facture`, puis cherchait cet intitulé comme identifiant SQL. L'attente cible maintenant l'identifiant CUID de la facture créée. Les assertions de montant, rattachement, audit, conservation du formulaire et aperçu restent présentes.

Le scénario de séquence attendait quatre minutes un bouton dans une carte de calendrier. Le même titre était présent dans la liste des tâches, avec le bouton attendu. Le sélecteur exige maintenant le titre et ce bouton dans la même carte ; la vérification de fin de séquence reste inchangée.

Types, lint et chargement des tests passent localement. La correction des sélecteurs exige une nouvelle exécution compilée ; les timeouts, tests, exclusions historiques, couverture et audits ne sont pas modifiés.
