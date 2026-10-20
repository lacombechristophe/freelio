# Progression des fenêtres calendrier

Le commit `1194b51df21158a9c008c2cc7ca327f64cfa07e4` corrige le [contrat de fenêtre calendrier](../../contrat-fenetre-calendrier.md). Le checkpoint chiffré conserve maintenant sa fenêtre ; une fenêtre devenue insuffisante est renouvelée pour découvrir aussi les événements inchangés qui étaient auparavant hors période. La pagination conserve ses bornes jusqu'à sa fin et les anciennes copies restent conservées.

Les six régressions initiales échouent sur Google et Microsoft : deux omissions après avancée de deux mois, deux fenêtres absentes du checkpoint, deux réponses acceptées après reconnexion. Les 29 cas dédiés couvrent ensuite reprise Microsoft sur onze pages avec changement de mois, quota/refus/panne, expiration, ancien token sans fenêtre, rotation concurrente et reconnexion avant requête, transaction ou checkpoint. Un premier harnais ne pouvait pas espionner la propriété virtuelle `$transaction` du proxy Prisma ; les deux échecs de recette sont conservés séparément de la correction.

Chaque page est importée dans une transaction qui verrouille sa connexion, avec génération et bail vérifiés. Le checkpoint, sa fenêtre et la fin de la progression sont enregistrés ensemble par comparaison des credentials et de la configuration. Un renouvellement de jeton préserve la fenêtre la plus récente. Les requêtes demandent 50 événements et chaque appel traite au plus quatre pages ; aucun délai de test ni seuil global n'est assoupli.

Le [relevé local](local.json) conserve les résultats natifs et leurs empreintes. Les 93 contrôles ciblés puis **2 858 tests dans 247 fichiers** passent sur une SQLite neuve, sans échec ni exclusion. Types, deux lints et build de 76 pages statiques réussissent ; les 1 143 fichiers source correspondent au commit. La couverture concerne les six modules configurés, pas toute l'application. Les 454 cas navigateur sont sélectionnés, pas exécutés. Le lockfile est inchangé depuis les audits npm complet et production du 20 octobre, qui signalaient zéro vulnérabilité.

Reproduire dans une copie sans `.env`, avec dépendances déjà installées, Node 24 et **nouvelle base fictive** :

```powershell
$env:DATABASE_URL = "file:./calendar-proof-$([guid]::NewGuid().ToString('N')).db"
$env:AUTH_SECRET = "fictional-isolated-verification-secret-only"
$env:ENCRYPTION_KEY = 'a' * 64
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --no-file-parallelism tests/unit/calendar-window.integration.test.ts tests/unit/oauth-sync-pagination.integration.test.ts tests/unit/oauth-mail-reconciliation.integration.test.ts tests/unit/incoming-attachment.integration.test.ts
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
npm run typecheck
npm run lint
npm run build
```

Prisma et les transactions SQLite sont réels ; HTTP fournisseur est simulé et seule l'horloge Date est contrôlée. Les intercalages déterministes ne qualifient ni contention PostgreSQL ni charge. Aucun schéma SQL ne change ; les anciens credentials sans fenêtre sont exercés sans inventer leur périmètre. Les parcours navigateur restent sélectionnés sans exécution ; aucun nouveau bouton n'est ajouté. Réplication des calendriers avancés, conflits local/fournisseur, invitations et comptes réels restent distincts.

L'[audit complémentaire](../20261020-native-conversations/README.md) reproduit deux échecs encore ouverts dans MAIL-05 : des conversations fournisseur différentes du même contact et au même objet sont regroupées localement. Ce probe SQL/HTTP indépendant n'est pas compté dans la suite complète réussie. Le prochain correctif doit conserver l'identité des conversations sans fusionner ou réécrire les historiques par supposition.

Aucun push, nouvelle CI, déploiement, fournisseur réel, installation ni coût n'est déclenché. La confirmation du plafond GitHub Actions à 0 € reste requise pour la qualification distante.
