# Attendre le résultat réel d'une action compilée

Les CI de `1586c1b` sont annulées au plafond de 35 minutes : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38317716890), [PR](https://github.com/lacombechristophe/freelio/actions/runs/38317721467). SQLite (1 944 tests), PostgreSQL (1 943 réussis, une exclusion native SQLite), neuf contrôles Linux et les deux audits passent dans chaque run. La suite navigateur reste incomplète.

Les traces identifient quatre échecs desktop de facturation des temps. Leur attente `factures/[^/]+` acceptait la page initiale `factures/temps-non-facture`, puis cherchait cet intitulé comme identifiant SQL. L'attente cible maintenant l'identifiant CUID de la facture créée. Les assertions de montant, rattachement, audit, conservation du formulaire et aperçu restent présentes.

Le scénario de séquence attendait quatre minutes un bouton dans une carte de calendrier. Le même titre était présent dans la liste des tâches, avec le bouton attendu. Le sélecteur exige maintenant le titre et ce bouton dans la même carte ; la vérification de fin de séquence reste inchangée.

Types, lint et chargement des tests passent localement. La correction des sélecteurs exige une nouvelle exécution compilée ; les timeouts, tests, exclusions historiques, couverture et audits ne sont pas modifiés.

Cette exécution aboutit sur a055d65 : les deux CI sont vertes, 361 parcours réussis et 19 exclusions historiques chacune. Les quatre assertions de facturation corrigées et le scénario de configuration d'automatisation passent ; les [résultats du candidat](../20261013-candidate/ci-a055d65.json) conservent les références. La suite navigateur dure 24,8 minutes dans la branche et 20,2 dans la PR ; le plafond global reste à 35 minutes.

La relance sur le commit de documentation `06d0d7c`, avec le même code hors `docs/`, expose une ambiguïté restante. Les [deux runs](ci-06d0d7c.json) terminent avec 360 parcours réussis, 19 exclusions et un échec : une tâche du jour possède une action dans « Priorités » et une autre dans « Toutes les tâches ouvertes ». Le sélecteur de carte trouve deux boutons. PostgreSQL et Linux passent dans les deux runs ; la CI complète de ce commit est rouge.

Le sélecteur est désormais limité à « Toutes les tâches ouvertes », puis à la ligne portant le titre exact et son propre bouton. Il exige une seule ligne avant le clic. La date du jour peut donc faire apparaître la tâche dans plusieurs sections sans rendre le test ambigu. Aucun premier bouton arbitraire, attente ou assertion métier n'est supprimé. Cette correction doit encore passer dans la nouvelle CI compilée.
