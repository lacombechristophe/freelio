# Erreurs fournisseurs et échéances de reprise

Code de production : `adbc86d32098c77e5301b129838d1aeb391a83b5` ; recette finale :
`379709e76b1be245c77e5e78f603de9ab3e0484e`, sans changement de production. Le
[contrat](../../contrat-erreurs-fournisseurs-courriels.md) précise les catégories,
la conservation des traces et les limites de cette correction.

Trois [régressions SQL avant correction](baseline.json) sont reproduites sur
`8987add` avec un transport réel et des réponses HTTP simulées : un second appel
manuel malgré `Retry-After`, la répétition d’une demande refusée en 422 et la
reprogrammation de ce même refus après sa première tentative. Leur
[source de reproduction](reproduction.test.ts.txt) utilise uniquement des
adresses et identifiants fictifs.

La catégorie de la dernière erreur HTTP et l’échéance restent dans la commande.
Le transport n’effectue aucune reprise lui-même. Les refus permanents et
d’autorisation arrêtent les reprises automatiques ; les temporisations et 5xx
respectent le plus tard du backoff et du délai fournisseur. Une tentative
effectivement effectuée reste comptée, ses admissions internes sont conservées
et une attente locale ne consomme pas de tentative supplémentaire.

Les quinze cas SQL dédiés passent par les fonctions manuelles, programmées et
de séquence, avec HTTP simulé. Ils couvrent l’échéance conservée après relecture,
la même clé d’idempotence, les cinq tentatives bornées, les CCI, les brouillons
Gmail/Graph et la protection d’une réponse perdue antérieure. Quatre cas du
journal empêchent de contourner ces échéances ou de relancer une demande invalide
inchangée. Les cas du protocole OAuth couvrent aussi deux refus pendant la
préparation des pièces Microsoft. Les vingt-sept cas de classification vérifient
les codes fournisseurs, les dates HTTP, les valeurs invalides et les messages
sans reprise du corps d’erreur distant.

Les [résultats locaux](local.json) rattachent chaque contrôle au candidat, au
manifeste des tests exécutés et à l’identité de la copie utilisée. La preuve de
mise à niveau conserve les empreintes des données historiques avant/après :
société, boîte, message accepté et commande incertaine. Le nouveau champ reste
`null` pour les commandes anciennes. Le SQL PostgreSQL est comparé au delta
généré et son schéma validé hors ligne ; la migration n’est pas exécutée sur ce
moteur.

Le premier passage complet donne 3 043 réussites et 18 échecs de reprise : la
fixture à horloge 2035 laissait son verrou global libéré avec cette date future.
Le nettoyage retire désormais ce verrou de test. Le rejeu ordonné des quinze cas
d’envoi, puis des dix-neuf cas de reprise sur la même base réussit. Les assertions
et délais métier restent inchangés ; la suite finale utilise une autre base neuve.

## Reproduction

Dans une copie externe sans `.env`, avec les dépendances déjà présentes, préparer
une SQLite fictive neuve avec `scripts/prepare-dev-database.mjs`, puis exécuter :

```powershell
$providerDatabase = Join-Path (Join-Path (Get-Location) "prisma") "provider-review-$([guid]::NewGuid().ToString('N')).db"
$env:DATABASE_URL = "file:$($providerDatabase.Replace('\', '/'))"
$env:AUTH_SECRET = "functional-isolated-test-secret-only"
$env:ENCRYPTION_KEY = "a" * 64
$env:RESEND_API_KEY = ""
$env:EMAIL_FROM = ""
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
node scripts/verify-provider-failure-upgrade.mjs
```

L’URL SQLite absolue évite de toucher une autre copie lorsque les dépendances sont
partagées. Pour la preuve avant correction, placer la source de reproduction en
`tests/unit/provider-send-failures.integration.test.ts` dans une copie du commit
`8987add`, puis sélectionner ce fichier. Aucun compte, installation, changement
d’offre ni envoi réel n’est nécessaire.

## Limites

Les erreurs réseau, conflits, brouillons disparus et réponses de succès
incomplètes gardent leur traitement conservateur. Un refus ultérieur ne prouve
pas qu’un appel antérieur n’a pas été accepté. La fenêtre de protection Resend
n’est jamais renouvelée par cette classification. Le renouvellement OAuth, la
synchronisation et les limitations globales d’un compte partagé ne sont pas
couverts ; la temporisation reste celle d’une commande.

PostgreSQL réel, image Linux, navigateur, comptes fournisseurs, CI et preview de
ce commit restent distincts. Les cas navigateur sont sélectionnés seulement.
Aucun push ni déploiement de ce lot n’est effectué tant que le budget GitHub
Actions de 0 € et l’arrêt de l’usage payant ne sont pas vérifiés. La couverture
publiée concerne six modules configurés, pas toute l’application.
