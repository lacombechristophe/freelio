# Plafonds internes des envois CRM

Référence testée : `3046a1179c2ecf624b1fb6fcc52ea8c6a83fd78a`. Les limites et leur mise à niveau sont
précisées dans le [contrat](../../contrat-plafonds-envoi.md). La démonstration reste
fictive, en lecture seule et sans qualification de fournisseur réel.

## Résultats

- **2989 tests réussis dans 259 fichiers**, SQLite neuve, aucun échec ni exclusion.
- Les 259 fichiers de tests suivis correspondent exactement au manifeste exécuté.
- 157 cas voisins dans 13 suites proviennent de cette même exécution complète ; ce n'est pas une suite supplémentaire.
- 1171 fichiers de source de la recette correspondent au commit.
- Génération des routes, types, ESLint, Oxlint et build de 76 pages réussis sur ce même commit.
- 1741 fichiers et 4432 objets Git contrôlés, aucun signal détecté par le scanner de publication.
- 456 cas navigateur sélectionnés, 228 par surface : **liste seulement, aucune exécution navigateur de ce complément**.

Les [mesures locales](local.json) contiennent les empreintes, le manifeste et la
portée des contrôles. La couverture reste celle des six modules configurés ; elle
ne mesure pas l'ensemble du produit.

## Invariants vérifiés

Les réservations minute/jour sont atomiques, dédupliquées par commande/période,
liées au contenu et aux destinataires, et conservées après une réponse inconnue.
Les tests couvrent les envois concurrents, CC/CCI, un changement de politique,
l'horloge reculée, la reconstruction des compteurs et le refus des références
étrangères. Les projections privées, le rôle Comptabilité, l'export logique et la
lecture seule sont vérifiés sur SQL.

Les transports Resend, Gmail et Graph utilisent de véritables chemins applicatifs
avec HTTP simulé. Ils réservent avant la commande d'envoi, après la préparation du
brouillon. La réparation d'une acceptation distante reste possible sans nouvelle
admission. Les attentes n'épuisent pas les tentatives ; une ancienne incertitude
reste protégée. L'annulation est limitée aux programmations jamais tentées et
sans admission ; les traces sont conservées.

## Diagnostics et mise à niveau

Le [diagnostic initial](baseline.json) rétablit uniquement l'ancien transport de
`81a98ec` dans une copie isolée. Le schéma et le moteur de quotas servent
d'instruments non appelés : ce n'est pas une réexécution de tout l'ancien projet.
Trois cas sélectionnés échouent réellement avant le raccordement ; les sept autres
cas du fichier sont exclus par ce filtre explicite. La [reproduction](reproduction.test.ts.txt)
est conservée. Un premier double de test réutilisait une réponse HTTP consommée ;
il a été corrigé avant cette mesure, sans assouplir les assertions.

Une nouvelle recette a aussi révélé que les premières clés étrangères bloquaient
la suppression d'une société. Le scénario est conservé et passe avec `NO ACTION` :
la suppression isolée d'une boîte référencée reste refusée, tandis que la cascade
complète d'une société fonctionne. L'ancienne société, sa boîte et sa commande en
échec restent identiques après une migration SQLite additive. Aucun quota ou
historique d'admission n'est inventé. Le schéma PostgreSQL est validé hors ligne ;
la migration n'a pas été exécutée sur PostgreSQL.

Le premier passage complet a donné 2 983 réussites et quatre échecs : trois fixtures
d'envoi sans le prérequis de quota/commande, puis un double d'erreur resté en
attente. Les fixtures ont été adaptées et isolées, sans changer les règles de
consentement ni les assertions. La nouvelle base et le nouveau rapport complets
sont distincts.

Le [diagnostic du relais](platform-baseline.json) reproduit aussi une sélection des
clés d'une boîte personnelle pour un expéditeur explicitement fixé à la plateforme.
Un contrôle positif vérifie l'inverse. Les deux identités gardent désormais leurs
clés et leurs plafonds ; la [reproduction spécifique](platform-reproduction.test.ts.txt)
utilise uniquement des valeurs fictives.

## Reproduction locale

Dans une copie externe sans fichiers `.env` et avec les dépendances déjà présentes,
utiliser un shell isolé avec ces seules valeurs fictives. Exemple PowerShell :

```powershell
$quotaDatabase = Join-Path (Join-Path (Get-Location) "prisma") "quota-review-$([guid]::NewGuid().ToString('N')).db"
$env:DATABASE_URL = "file:$($quotaDatabase.Replace('\', '/'))"
$env:AUTH_SECRET = "functional-isolated-test-secret-only"
$env:ENCRYPTION_KEY = "a" * 64
$env:RESEND_API_KEY = ""
$env:EMAIL_FROM = ""
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
```

Pour isoler les 39 cas dédiés, sélectionner `email-send-quotas.integration.test.ts`,
`email-send-quota-transport.integration.test.ts` et `email-send-quota-settings.test.ts`.
Pour la preuve avant correction, utiliser la copie du fichier de reproduction avec
l'ancien transport et le filtre `refuses a new send|admits an identical retry|retains admissions after`.
Pour le relais, rétablir les deux fichiers indiqués dans `platform-baseline.json`
au commit `c689a50`, uniquement dans cette copie, puis utiliser le filtre
`keeps an explicit (platform|BYOK) sender` avec le fichier de reproduction spécifique.
Aucune installation ni requête de fournisseur réel n'est nécessaire. Une copie
partageant `node_modules` doit utiliser une URL SQLite absolue pour ne pas toucher
la base de la source des dépendances.

## Limites

Pas de push, nouvelle CI, migration PostgreSQL, contrôle Linux, interaction
navigateur ou déploiement de ce complément. Le plafond GitHub Actions à 0 € doit
être attesté avant publication. Les plafonds internes ne garantissent ni ceux du
fournisseur, ni la délivrabilité, ni l'absence de facturation. Les liens magiques
utilisent un transport distinct. Le préflight domaine/quota des campagnes, les
métriques et les autres exigences ouvertes du plan fonctionnel restent séparés.
