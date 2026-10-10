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

Le [rejeu élargi de 960b8b6](evidence/20261010-preview-readiness/hosted-modules-960b8b6.json) échoue encore sur ordinateur et mobile : une erreur React 418 dans Planning. Les tournées et la capacité hebdomadaire utilisaient encore des limites implicites. Le complément emploie le même fuseau et l'heure d'observation serveur ; une intervention future à cheval sur minuit couvre aussi le regroupement des tournées dans les huit E2E. Types, deux lints, 39 tests ciblés et build passent après ce complément. Ce résultat local ne remplace pas sa recette navigateur.

Un contrôle supplémentaire reproduit une limite de journée incorrecte à Santiago le 6 septembre 2026 : minuit n'existe pas lors du changement d'heure et l'ancien convertisseur retenait le jour précédent. Le calcul cherche désormais le premier instant du jour civil dans le fuseau choisi, y compris lorsqu'un minuit est sauté ou répété. Deux régressions vérifient Santiago et La Havane, le dernier instant du jour précédent et les journées de 23/25 heures. Le convertisseur des formulaires de rendez-vous reste distinct.

La [qualification locale du complément](evidence/20261010-preview-readiness/service-calendar-complement-local.json) passe 1 657 tests / 191 fichiers, types, deux lints et build. Les huit E2E de calendrier et les deux parcours hébergés se chargent ; ce chargement ne vaut pas exécution navigateur. Le scan des sources et de l'historique Git ne relève aucun secret selon ses règles.

## Reproduire le parcours hébergé

Le fichier `playwright.hosted.config.ts` est indépendant de la configuration E2E locale : il ne lance ni serveur ni seed. Fournir dans l'environnement une URL HTTPS explicite (`PLAYWRIGHT_BASE_URL`) et les identifiants du compte fictif (`HOSTED_DEMO_EMAIL`, `HOSTED_DEMO_PASSWORD`). Si la preview est protégée, utiliser uniquement un accès d'automatisation Vercel déjà autorisé dans `VERCEL_AUTOMATION_BYPASS`. Ne pas versionner ces valeurs.

```sh
npx playwright test --config playwright.hosted.config.ts
```

Les deux parcours chargent 49 pages/onglets avec un navigateur en UTC+14 et un autre en UTC−8, contrôlent sondes, connexion, restrictions de mutation, PDF en mémoire, navigation mobile et déconnexion. Les requêtes externes du navigateur sont bloquées. Les erreurs JavaScript font échouer la recette. Le rapport joint contient uniquement les routes et erreurs, sans identifiants ni en-têtes ; traces et captures sont désactivées. Les identifiants fictifs et l'accès de protection restent fournis séparément. Cette recette est une vérification de lecture et de rendu, pas une qualification des envois ou de tous les parcours métier.

## Rejeu de 9086a5d

Le déploiement `dpl_B3UMgp55cJn6BDJ9nPSD2RPpKKuW` est construit depuis `9086a5d7a31747fae91e8757c83c9ceaae87ad83`. L'alias de branche est vérifié contre cet identifiant avant et après exécution ; les empreintes des deux fichiers de test exécutés correspondent au commit. Le [test hébergé versionné](evidence/20261010-preview-readiness/hosted-9086a5d.json) réussit ses deux parcours sans exclusion ni retry : 49 pages/onglets chacun, zéro erreur JavaScript, sondes HTTP 200, connexion réelle du compte fictif, restrictions HTTP 403, PDF de brouillons, navigation mobile et déconnexion. Les rapports antérieurs en échec restent conservés.

Les [deux CI de 9086a5d](evidence/20261010-preview-readiness/ci-9086a5d.json) passent aussi : 1 657 tests SQLite, 1 656 PostgreSQL avec une exclusion native SQLite, 299 E2E avec 19 exclusions historiques et neuf contrôles Linux. Les huit E2E de calendrier passent dans chacun des deux runs.

Cette qualification hébergée porte sur la preview protégée et le compte fictif Owner. Le [correctif des droits d'Organisation](contrat-organisation-domaines-droits.md), approuvé ensuite, est qualifié séparément pour les autres rôles. Aucune fusion sur main ni modification de production n'est effectuée.

## Rejeu de 021bfac et suites ciblées

Le [rejeu hébergé de 021bfac](evidence/20261010-preview-readiness/hosted-021bfac.json) passe les deux parcours de 49 pages/onglets, sans exclusion, retry ni erreur JavaScript. L'alias correspond à `dpl_RzkV4y9Cso4zfwzJbxW4FMg5CUmb` avant et après exécution ; les empreintes du harnais correspondent au commit.

Les [deux CI de ce même candidat](evidence/20261010-preview-readiness/ci-021bfac.json) passent PostgreSQL, Linux et les six E2E Organisation. Elles restent en échec sur le rendez-vous du portail : le créneau fixe du 10 octobre à 10 h est devenu passé, et l'API répond HTTP 400 avec sa validation temporelle. Les dates de ce test sont remplacées par des créneaux futurs calculés ; l'assertion HTTP 201 s'ajoute à la confirmation et aux vérifications existantes. Le nouveau rejeu reste nécessaire. Cette correction de fixture ne change aucun parcours produit.
