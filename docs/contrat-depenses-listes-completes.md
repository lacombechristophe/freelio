# Dépenses : historique complet et indicateurs

## Défaut reproduit

Sur `61d7331`, la page appelle le lecteur existant sans poursuivre son curseur. Une recette SQLite isolée crée 51 dépenses cohérentes du même mois : 50 de 1 € et une plus ancienne de 99 €. La page reçoit 50 lignes et calcule 50 € et 50 dépenses à justifier, contre 149 € et 51 sur le périmètre accessible. Le curseur retrouve la ligne omise : le défaut concerne le parcours de page et ses cartes.

Les deux cas du diagnostic constatent ces faits avec les vraies actions, adhésions, DAL et lignes SQL ; authentification et cache Next sont simulés. Aucun fournisseur, fichier réel ou base hébergée n'est utilisé. Le correctif antérieur des relations entre sociétés reste qualifié séparément.

## Lot approuvé le 10 octobre 2026

- Rechercher par libellé ou fournisseur dans tout l'historique autorisé ; afficher 25 lignes par page, total, numéro de page, précédent et suivant.
- Trier par date puis identifiant pour départager les dates identiques. Ramener une page devenue vide à la dernière page existante, ou à la première pour une liste vide.
- Calculer « Total Mois » et « À Justifier » sur tout le périmètre accessible, indépendamment de la recherche et de la page. Le mois vient du fuseau de service de la société ; les dates sans heure conservent leur jour UTC enregistré.
- Conserver formulaires ouverts, saisie, actions existantes, cartes, colonnes, couleurs et disposition générale. Réutiliser la pagination commune et ses états de chargement/échec ; conserver la saisie lors d'une erreur de lecture.

`getExpenseDirectory` exige Finance avant toute lecture métier. Le même prédicat société/client/chantier protège lignes, recherche, sommes et compteurs ; le DAL conserve les restrictions d'agence. Les entrées sont validées, la réponse est projetée et limitée à 25 lignes. Compteurs et page sont lus dans une transaction sérialisable. Cela ne promet pas une capture immuable entre deux pages consultées à des instants différents.

La vue reçoit les valeurs calculées au serveur et ne recalcule aucun mois dans le navigateur. Les réponses devenues obsolètes sont ignorées ; une erreur masque les résultats périmés et permet de réessayer. Les formulaires sont rendus indépendamment de la liste. Les rafraîchissements après mutation conservent recherche et page demandée, avec correction côté serveur si nécessaire.

## Vérification

`expense-directory.integration.test.ts` couvre 26 cas : 51 lignes avec dates identiques, recherche ancienne/insensible à la casse, cartes indépendantes du filtre, suppression/justification, historique vide, quatre rôles autorisés, quatre rôles refusés avant lecture, révocation d'agence, relations étrangères, entrées invalides, cinq frontières de mois/fuseau et lecture en démo publique.

`expense-directory.spec.ts` ajoute quatre parcours ordinateur/mobile, avec navigateur en America/Los_Angeles et société en Europe/Paris : rendu serveur, recherche/pagination, cartes complètes, absence d'erreur d'hydratation et formulaire conservé lors d'un échec simulé suivi d'une reprise. Le seed possède ses sociétés fictives dédiées. Les six E2E antérieurs de droits restent distincts.

La qualification locale et les CI doivent identifier leur SHA et leurs limites. Le chargement Playwright ne vaut pas exécution. Les pièces réelles, fournisseurs et performances sur gros volumes hébergés restent hors de cette recette.

```sh
npx vitest run tests/unit/expense-directory.integration.test.ts tests/unit/expense-relations.integration.test.ts tests/unit/expense-permissions.test.ts --no-file-parallelism
npx playwright test tests/e2e/expense-directory.spec.ts tests/e2e/expense-relations.spec.ts
```
