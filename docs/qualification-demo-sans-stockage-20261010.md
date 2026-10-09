# Démo publique sans stockage persistant

Le propriétaire conserve un budget de 0 € et renonce à activer R2. La preview utilise une base PostgreSQL fictive dédiée, son rôle lecteur et Upstash Free pour la limitation distribuée. Elle ne nécessite aucun abonnement de stockage objet. Cela ne garantit pas la disponibilité permanente des offres gratuites.

## Contrat

`FILE_STORAGE_DRIVER=disabled` et `MIGRATION_STORAGE_DRIVER=disabled` sont acceptés par la sonde de production uniquement avec `DEMO_ACCESS_MODE=readonly`, `NEXT_PUBLIC_DEMO_MODE=true` et `NEXT_PUBLIC_DEMO_READ_ONLY=true`. Les flags publics sont fixés au build. PostgreSQL, les secrets d’authentification, les URL HTTPS et les paramètres Upstash restent requis. Les secrets des fournisseurs métier restent interdits dans ce profil.

Les deux gestionnaires refusent lectures, écritures, suppressions et transferts signés avant tout accès au disque ou au fournisseur. Des identifiants R2 présents par erreur ne réactivent pas le stockage. Il n’existe aucun repli sur le disque temporaire de Vercel. Les fonctions donnant accès aux chemins locaux sont aussi bloquées.

Le seed fictif contient des brouillons, sans archives émises ni pièces jointes. Les PDF de brouillons sont calculés en mémoire à la demande ; les contrôles documentaires restent actifs. Ce profil ne convient pas pour présenter la récupération d’archives ou l’envoi de pièces réelles. La démo publique interdit déjà les mutations. L’application modifiable continue à exiger R2 en production ; aucune garantie de conservation n’est retirée à ce profil.

## Vérifications

Avant correction, les nouveaux tests et ceux de readiness produisent 18 échecs et 16 succès. Après correction, les 40 tests ciblés passent, incluant les six contrôles préexistants d’intégrité des téléversements R2. Les tests du profil désactivé vérifient l’absence d’appels filesystem, S3 et presigner, avec des identifiants synthétiques R2 présents. La matrice de configuration refuse les flags incohérents, les drivers mixtes, un Upstash absent et une production modifiable sans stockage durable.

La copie locale isolée réussit ensuite génération Prisma SQLite, typage, ESLint, Oxlint, les 1 641 tests de 189 fichiers et le build de production. Aucun serveur local ni conteneur n’est lancé pour cette recette. Les deux drivers Vercel sont modifiés uniquement pour la branche de preview ; les métadonnées de production restent identiques. Le [rapport compact](evidence/20261010-preview-readiness/storage-free.json) conserve ce périmètre sans secrets.

Reproduction sans fournisseur ni données réelles :

```sh
npx vitest run tests/unit/readiness.test.ts tests/unit/disabled-storage.test.ts tests/unit/direct-upload-integrity.test.ts --no-file-parallelism
```

Ces contrôles ne prouvent pas encore la connexion hébergée, la disponibilité Upstash ni le rendu PDF Vercel. La [préparation de preview](evidence/20261010-preview-readiness/README.md) conserve les contrôles SQL et les sondes antérieures ; la recette du nouveau déploiement doit préciser son commit exact.
