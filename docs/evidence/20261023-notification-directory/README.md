# Historique des notifications

Le centre d’activité réutilisait l’aperçu limité aux 50 dernières notifications. Un test SQL de 51 lignes reproduit l’absence de la plus ancienne malgré une demande de page 3 ; le témoin confirme que la cloche garde son aperçu récent et son compteur complet.

## Correction

Le centre utilise un lecteur dédié, paginé par 25, avec recherche dans le titre et le message, filtres Toutes / Non lues / Lues et ordre stable par date puis identifiant. Les compteurs portent sur tout le périmètre personnel de la société courante. La liste et ses compteurs sont lus dans une transaction ; cela ne fige pas l’historique entre deux pages consultées à des instants différents.

Recherche, filtre et page sont dans l’URL. La page demandée est bornée au nombre réel de résultats, notamment après suppression du dernier élément ou changement de son état. Aucun identifiant d’utilisateur ou de société fourni par le navigateur n’est utilisé pour sélectionner les notifications. Les anciennes lignes sans société restent invisibles et conservées.

Le compteur Non lues et les commandes globales concernent toutes les notifications personnelles de cet espace, y compris hors filtre. La confirmation de suppression le précise. Un filtre vide est distingué d’un historique vide. La démo publique conserve recherche et pagination, avec commandes de mutation désactivées et clic sur la carte sans marquage automatique ; le serveur continue de refuser les écritures.

L’aperçu de la cloche et celui de l’accueil restent bornés. Aucun schéma, dépendance, droit de rôle ou document historique n’est modifié.

## Résultats locaux

La [preuve de `9499060`](local.json) consigne **60 cas ciblés dans six fichiers**, puis **3 994 tests dans 298 fichiers** sur une autre SQLite neuve, sans échec ni exclusion, en 580,07 secondes. Les 22 nouveaux cas sont tous présents dans cette suite complète.

Types, ESLint/Oxlint et build propre Next.js 16.4.2 de 76 pages passent ; 1 270 fichiers de source correspondent au commit. Les seuils de couverture passent sur les six modules configurés, pas sur toute l’application. Les **522 E2E dans 105 fichiers** sont sélectionnés seulement. PostgreSQL, l’image Linux et les interactions navigateur de ce candidat restent à qualifier.

## Reproduction

Dans une copie installée du commit testé, définir `DATABASE_URL` vers une SQLite fictive neuve et les secrets de test, puis préparer cette base avec `node scripts/prepare-dev-database.mjs`.

```sh
node node_modules/vitest/vitest.mjs run tests/unit/notification-directory.integration.test.ts tests/unit/notification-directory-view.test.ts tests/unit/notifications-scope.integration.test.ts tests/unit/account-export-scope.integration.test.ts tests/unit/account-deactivation.integration.test.ts tests/unit/directory-pagination-view.test.ts --no-file-parallelism
```

La suite SQL passe par la vraie page serveur et le lecteur, avec session simulée : deux sociétés, plusieurs destinataires, accès révoqué, lignes sans société, rôles sans administration, recherche ancienne, tri à dates égales et dernière page disparue. Les quatre rendus statiques vérifient les valeurs, le formulaire et les commandes désactivées ; ils ne testent pas les interactions navigateur.

Deux scénarios Playwright, déclinés sur desktop et mobile, sont préparés avec des fixtures de 51 notifications : recherche, pagination, retour, rafraîchissement et filtres de lecture. Leur sélection ne vaut pas exécution. Aucun navigateur, compte fournisseur réel ni base hébergée n’est utilisé pour la qualification locale.
