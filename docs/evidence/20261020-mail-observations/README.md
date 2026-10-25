# États fournisseur et pièces entrantes

Le commit `d02c701d4ced6399ffe2195fa5e322a0eb4bb212` distingue l'observation Gmail/Outlook du suivi CRM. Le correctif `8a7f9a6c04a2ec51d0bd6fb34082b868d97e4682` ferme ensuite deux fenêtres de reconnexion, avant le premier checkpoint et pendant l'écriture d'erreur. Une conversation close reste close quand son message devient non lu ou change de dossier chez le fournisseur. Un GET 404 conserve la copie locale ; un refus d'accès ou une panne ne devient pas une preuve de suppression. Les anciens messages sans observation gardent un état inconnu.

Gmail reprend son historique ; Graph conserve un delta par dossier avec identifiants immuables. Une page est acquittée après ses messages et sa position de travail est persistée par lots de 50. Les copies anciennes restent réconciliables, y compris après déplacement hors Réception et Envoyés. Une simple observation ne recrée ni réception, ni arrêt de séquence. Le [contrat](../../contrat-etats-messageries-entrantes.md) précise la fenêtre d'import, les bornes et les limites de cette stratégie.

Les pièces distantes affichent nom, taille et refus éventuel. Le téléchargement PDF/PNG/JPEG est borné à 5 Mo, contrôle métadonnées et signature, puis revérifie l'adhésion et l'accès à la boîte. Le navigateur ne choisit aucun hôte ni identifiant fournisseur brut. Le renouvellement d'un jeton pendant cette lecture est limité au secret chiffré de la boîte autorisée ; il n'accorde pas un droit de configuration. Aucune copie durable ni analyse antivirus n'est annoncée ; la démo publique refuse les lectures fournisseur.

Le [relevé local](local.json) identifie les rapports natifs et leur empreinte. La reproduction initiale échoue sur trois des quatre cas. Les premiers essais d'implémentation exposent ensuite une clé de pièce dépendante de l'ordre des propriétés, une projection Prisma incompatible avec la portée des boîtes privées et un renouvellement de jeton refusé au rôle lecteur. La revue de concurrence reproduit trois défauts supplémentaires contre `d02c701`, puis passe 26 cas après correction et 71 avec les suites voisines. Un premier harnais externe pointait sa base relative au mauvais répertoire ; cet échec de fixture est conservé séparément. Les diagnostics ne sont pas transformés en succès.

La suite finale passe **2 817 tests dans 246 fichiers**, sans échec ni exclusion, sur une SQLite neuve. Types, ESLint, Oxlint et build de 76 pages statiques réussissent. Les six modules de couverture configurés dépassent leurs seuils inchangés ; ils ne représentent pas toute l'application. Les 1 140 fichiers source de la recette correspondent au commit `8a7f9a6`. La sélection navigateur contient 448 cas, 224 par surface, sans exécution. Le schéma PostgreSQL est valide et son diff hors connexion correspond à la migration additive ; cette migration n'est pas encore exécutée sur PostgreSQL.

Reproduction avec Node 24, dépendances déjà installées et copie sans `.env`, sur une **nouvelle base fictive** :

```powershell
$env:DATABASE_URL = "file:./mail-proof-$([guid]::NewGuid().ToString('N')).db"
$env:AUTH_SECRET = "fictional-isolated-verification-secret-only"
$env:ENCRYPTION_KEY = 'a' * 64
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
node scripts/verify-mail-observation-upgrade.mjs
node node_modules/next/dist/bin/next typegen
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js . --max-warnings 0
node node_modules/oxlint/bin/oxlint .
node --max-old-space-size=4096 --import ./scripts/build-memory.mjs node_modules/next/dist/bin/next build --webpack
```

Les tests fournisseurs utilisent HTTP simulé, avec Prisma et SQLite réels. Ils ne qualifient ni Google/Microsoft réels, ni la contention PostgreSQL, ni une boîte volumineuse. La fixture UI est déconnectée et sans secret ; le parcours navigateur est préparé, sans exécution locale autorisée. L'évolution de schéma conserve les cinq lignes et toutes les anciennes colonnes d'une base historique fictive, dont deux messages ; la nouvelle observation reste `NULL`.

Aucun push, nouvelle CI, déploiement, abonnement ou appel fournisseur n'est déclenché. Le plafond GitHub Actions à 0 € reste à vérifier avant nouvelle CI. La qualification distante du candidat demeure ouverte.
