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

## Preview de 92a07a3

Le déploiement `dpl_3NVEFHHHCNpvpjsBoajxKqvH1jGj`, construit depuis `92a07a3c81e672bff16b2628f8c04f223ad19ece`, utilise les vrais paramètres Upstash renseignés par le propriétaire et les deux drivers désactivés. L’alias de branche est vérifié contre l’identifiant exact du déploiement. Les [rapports ordinateur et mobile](evidence/20261010-preview-readiness/hosted-92a07a3.json) sont exécutés via l’accès d’automatisation Vercel existant ; aucun nouvel accès n’est créé.

Les sondes live/ready répondent HTTP 200, la connexion par mot de passe réussit et les lectures clients/devis/factures/dépenses fonctionnent. Les commandes de mutation restent désactivées ; les points d’entrée interdits répondent HTTP 403 avant et après connexion. Les PDF du devis et de la facture brouillon répondent HTTP 200 avec signature `%PDF-`, sans stockage objet. La recherche serveur, la déconnexion et la navigation à 390 px fonctionnent.

**La recette navigateur reste en échec** : trois erreurs React 418 sont relevées sur chaque parcours. Les requêtes externes sont bloquées ; seul `vercel.live` est demandé. Le rejeu avec l’en-tête officiel `x-vercel-skip-toolbar: 1` conserve les erreurs. Aucune assertion n’est supprimée et aucune ressource externe n’est autorisée pour les masquer.

Le [diagnostic de fuseau](evidence/20261010-preview-readiness/date-timezone.json) lit uniquement une date fictive : `2026-10-09T22:40:48.512Z`. Le formatage UTC produit « 9 oct. 2026 », le navigateur Europe/Paris « 10 oct. 2026 ». Les lecteurs de ce candidat utilisent le fuseau implicite. Le propriétaire autorise ensuite la correction proposée par « continue termine tout ». Le suivi ci-dessous distingue cette correction du lot sans stockage initial.

Ces contrôles ne qualifient ni la charge distribuée Upstash, ni un incident fournisseur, ni une récupération d’archives. La [préparation de preview](evidence/20261010-preview-readiness/README.md) conserve les contrôles SQL et les sondes antérieures. La CI du nouveau commit reste une vérification distincte.

## Correction du jour calendaire

Les trois formatages des listes Devis, Factures et Dépenses utilisent explicitement UTC. Les dates enregistrées, les documents et la présentation restent conservés. Les horaires des rendez-vous et des envois ne sont pas concernés.

Le test `tests/e2e/document-calendar-dates.spec.ts` compare les cellules du HTML serveur et celles du navigateur en UTC+14 et UTC−8, sur ordinateur et mobile. Deux sociétés fictives dédiées contiennent des documents à 23 h 30 UTC le 31 décembre 1999 et à 0 h 30 UTC le 1er janvier 2000. La recherche de chaque document vérifie aussi l'hydratation et les actions de lecture ; aucune erreur de page n'est tolérée.

Le contrôle du seed sur SQLite neuve et les types, deux lints, 40 tests ciblés et build passent localement. Les quatre E2E se chargent ; leur exécution reste à vérifier en CI. Les [résultats locaux](evidence/20261010-preview-readiness/calendar-local.json) ne prétendent pas qualifier le navigateur.

La référence antérieure `6156c83` réussit les deux CI : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38004872732), [PR](https://github.com/lacombechristophe/freelio/actions/runs/38004876061). Les [preuves](evidence/20261010-preview-readiness/ci-6156c83.json) distinguent SQLite (1 641), PostgreSQL (1 640 et une exclusion), navigateur (291 et 19 exclusions), neuf contrôles Linux et audits sans vulnérabilité. Cette CI précède la correction des dates et ne supprime pas le défaut constaté en preview.

Le rejeu hébergé de `bc8f2d6bf6efb84803d03eaff03224138cb3867d` réussit sur ordinateur en UTC+14 et mobile en UTC−8 : sondes, connexion, listes, recherche, PDF et refus d'écriture, puis déconnexion. Aucune erreur de page n'est relevée. Les restrictions réseau et assertions restent identiques ; l'alias est vérifié contre `dpl_AwaeGFF2sZGN27btVZyEdmrSvwFL`. Le [rapport](evidence/20261010-preview-readiness/hosted-bc8f2d6.json) conserve les deux parcours. Les anciens rapports rouges restent présents. Ce rejeu ne qualifie pas les quatre E2E autour de minuit, qui utilisent leurs propres fixtures en CI.

## Revue des autres modules et calendrier de service

Un [parcours élargi de bc8f2d6](evidence/20261010-preview-readiness/hosted-modules-bc8f2d6.json) charge 45 pages et onglets supplémentaires, tous en HTTP 200. L'assertion finale échoue avec quatre erreurs React : une dans Chantiers, deux dans Opérations et une dans Organisation. Ce diagnostic interdit de déduire la stabilité de toute l'application du seul parcours documentaire réussi.

Le propriétaire approuve ensuite l'harmonisation de ces trois écrans. Les dates de chantier gardent leur jour UTC ; les rendez-vous utilisent `Company.serviceTimezone`. Organisation calcule ses limites jour/semaine/mois/année dans ce même fuseau, puis convertit les limites en dates civiles UTC pour les champs sans heure (temps, échéances et objectifs). Une journée de changement d'heure peut durer 23 ou 25 heures. Le calendrier hebdomadaire avance les dates civiles, sans additionner arbitrairement 24 heures à un instant local.

Opérations reçoit une heure d'observation serveur et la prochaine limite de journée. Ses compteurs et sa sélection initiale ne sont plus recalculés avec l'horloge ou la fin de journée implicite du navigateur. Ce lot ne modifie aucun horaire en base, ni la conversion des formulaires `datetime-local` existants ; il porte sur les lecteurs et le rendu initial approuvés.

Huit cas purs couvrent les frontières civiles, le lundi et les passages d'heure ; six cas SQL exécutent les vrais lecteurs avec deux fuseaux de société et deux fuseaux de serveur. Le seed dédié ajoute chantier, site, intervention et tâche fictifs. Quatre E2E supplémentaires comparent HTML serveur et navigateur pour Chantiers, Planning et Organisation. Les [résultats locaux](evidence/20261010-preview-readiness/service-calendar-local.json) passent 1 655 tests / 191 fichiers, types, deux lints et build. Les huit E2E se chargent ; leur exécution CI et le nouveau rejeu hébergé restent à consigner.
