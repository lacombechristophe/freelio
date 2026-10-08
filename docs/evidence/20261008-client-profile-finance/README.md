# Montant de renouvellement dans les réponses Client

Les lecteurs `getClients` et `getClientById` retournaient `renewalAmountCents` sans `finance.read`, même si ces écrans n’affichent pas ce champ. Le correctif ajoute deux gardes de retour, sans modifier la base, les rôles ou l’interface. Les rôles disposant de Finance conservent le montant ; les autres reçoivent `null`. Les scores relationnels sont un sujet distinct.

La [comparaison SQLite](comparison.json) emploie le même fichier corrigé de 21 cas : dix assertions échouent sur le code de 3def5cd, onze passent ; après correction, les 21 cas passent ainsi que les 30 cas d’annuaire et 17 cas de fiche Client préexistants. Session/cache Next seuls sont simulés ; les lecteurs, droits et requêtes SQL sont réels. Les tests vérifient aussi le montant stocké inchangé, la rétrogradation avec la même session, l’isolation de société et la démo en lecture seule.

La première fixture supprimait la société avant ses clients, dont la relation n’a pas de cascade. Ce défaut de nettoyage provoquait un retour non nul même après les 68 assertions réussies. La fixture supprime maintenant explicitement ses clients ; les deux comparaisons ont été rejouées, et les quatre sociétés/deux utilisateurs fictifs des essais précédents ont été nettoyés uniquement dans la recette isolée. Les métadonnées conservent cet incident de test.

Dans une copie isolée, avec dépendances du lockfile, base neuve et secrets fictifs :

```sh
npm run test:unit -- tests/unit/client-profile-finance.integration.test.ts tests/unit/client-directory-permissions.integration.test.ts tests/unit/client-read-scope.integration.test.ts
```

Pour reproduire le défaut, remplacer uniquement `src/actions/clients/index.ts` dans cette copie par sa version de 3def5cd, puis restaurer le fichier courant. Types et deux lints ciblés passent ; PostgreSQL et CI du nouveau candidat restent à obtenir. Aucun parcours navigateur n’est annoncé modifié par ces deux champs de réponse serveur.
