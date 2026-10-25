# Qualification PostgreSQL native

Le candidat `4888070ec883ca8904f162ac0f775534c728d226` est testé sur PostgreSQL 18.3 sous Windows, dans un cluster local neuf, accessible uniquement sur la boucle locale. Les dépendances déjà installées sont copiées sans téléchargement ni script d’installation ; aucune donnée ou configuration du projet utilisé n’est reprise. Les **73 migrations sont appliquées par le moteur Prisma 6.12**, dans une base vide. Il s’agit d’une qualification distincte de la [mise à niveau Neon](../20261023-schema-readiness/README.md).

Les suites complètes terminent avec **4 052 réussites et une exclusion SQLite sur PostgreSQL**, puis **4 053 réussites sans exclusion sur SQLite**, dans les mêmes 304 fichiers. Le reçu identifie les 1 229 fichiers de code, tests et configuration comparés sans écart ; les résultats intermédiaires ci-dessous restent conservés. Le cluster PostgreSQL de recette est arrêté après les contrôles, sans effacer ses données.

Types, ESLint/Oxlint et build propre Next.js 16.4.2 passent ; le build génère 76 pages statiques. Une seconde comparaison retrouve 1 231 fichiers identiques dans la copie SQLite et de build, sur un inventaire incluant deux configurations racine supplémentaires. Les rapports de tests et de compilation sont liés au même candidat ; aucun résultat Linux ou navigateur n’est déduit de ce build.

## Défauts reproduits

Le premier passage du socle `6234b6b` termine 3 997 tests avec succès, 44 en échec et une exclusion native SQLite. Les échecs se répartissent entre 41 cas d’entretien, deux contrôles de chevauchement et une lecture de planning volumineux. Le rapport initial est conservé avec son empreinte dans le [reçu](local.json).

Prisma transmet une `Date` de requête brute comme `timestamp with time zone`, alors que les colonnes `DateTime` du schéma contiennent les composantes UTC dans un `TIMESTAMP(3)` sans fuseau. Sur une session `Europe/Paris`, la conversion implicite décale ces valeurs d’une heure en hiver et de deux en été. Un contrôle de version pourtant valide échoue et certains chevauchements ne sont plus détectés. Ce comportement est reproduit directement avec Prisma 6.12, puis par un test qui échoue avant correction. La [documentation PostgreSQL](https://www.postgresql.org/docs/18/datatype-datetime.html) précise ces conversions et leur dépendance au fuseau de session.

`f8b56b1` lie une chaîne ISO avec conversion explicite en `TIMESTAMP(3)` pour PostgreSQL et conserve le paramètre `Date` de SQLite. Les versions, dates persistées et bornes des requêtes d’entretien, de réservation de créneau et de départ du compte utilisent ce traitement. Droits, verrous, audits et refus de données périmées restent appliqués. Le test SQL vérifie hiver et été dans les sessions UTC, Paris et New York, y compris le refus d’une ancienne version après mise à jour. La CI PostgreSQL configure sa seule base de test en `Europe/Paris` avant la suite applicative.

`4888070` réutilise le classificateur des transactions annulées pour les saisies de temps, au lieu de dépendre du prototype JavaScript d’une erreur Prisma. Les codes P2034 et les états SQL de sérialisation/deadlock explicitement annulés sont reconnus ; timeout et perte de connexion ne sont pas rejoués. Quatre cas unitaires échouent avant correction ; les huit cas passent ensuite, avec un maximum de trois tentatives et une autorisation relue à chaque essai. Les 71 cas ciblés, dont l’intégration PostgreSQL des temps concurrents et du budget, passent.

La lecture de 10 001 créneaux dépasse aussi le délai transactionnel de cinq secondes. Un profilage dans la copie, avec un délai temporairement porté à vingt secondes pour observer son terme, mesure environ 10,57 secondes de requêtes et 0,76 seconde de traitement. `c6e5096` remplace le curseur Prisma par une progression explicite sur les deux clés de tri, date et identifiant. Le même cas termine ensuite en environ **2,76 secondes**, avec une réponse de **2 663 octets**, et le délai de cinq secondes reste inchangé. Une régression de 501 créneaux au même instant vérifie les frontières de lots, les conflits, les totaux et les six éléments de l’aperçu. Ces mesures isolées ne constituent ni une garantie de latence ni une qualification de charge.

## Reproduction et portée

Dans une copie installée, configurer les variables fictives de la [CI](../../../.github/workflows/ci.yml), avec une base PostgreSQL locale vide réservée aux tests. Appliquer les migrations, puis utiliser :

```sh
node scripts/sync-prisma-schemas.mjs
node node_modules/prisma/build/index.js migrate deploy --schema prisma/postgresql/schema.prisma
node node_modules/vitest/vitest.mjs run --no-file-parallelism --reporter=default --reporter=json --outputFile=test-results/unit-postgres.json
```

Le test `sql-timestamp.integration.test.ts` sélectionne ses fuseaux dans chaque transaction et restaure automatiquement la configuration à sa fin. Pour reproduire également les parcours applicatifs avec une session non UTC, la CI applique `ALTER DATABASE crm_test SET timezone TO 'Europe/Paris'` avant l’ouverture des connexions de test. Les intégrations créent et suppriment leurs propres données fictives ; cette commande ne doit pas cibler la base de démonstration hébergée.

Les 114 tests ciblant les dates et les parcours concernés passent sur PostgreSQL et sur une SQLite neuve. Les 64 cas du planning et du calendrier passent sur PostgreSQL ; les 101 cas incluant aussi les relations Opérations passent sur SQLite. Types, ESLint et Oxlint passent. Le [reçu final](local.json) donne les résultats des suites complètes et les empreintes des rapports, liés aux fichiers effectivement testés.

La première tentative SQLite réutilisait une ancienne base temporaire dont le schéma était incomplet ; elle n’est pas retenue comme qualification du code. Elle est conservée séparément des résultats obtenus après création de la base neuve.

Le premier passage SQLite sur `4888070` termine 4 052 tests avec succès et un échec : la préparation de la fixture de renouvellement dépasse dix secondes, avant l’assertion métier. Le fichier complet de 31 tests passe ensuite sans modification de source, d’assertion ou de délai. Le rapport initial est conservé ; la cause de cette variation de durée n’est pas établie. Le reçu distingue ce rejeu ciblé du passage complet suivant.

Un passage intermédiaire PostgreSQL termine 4 043 tests avec succès, une exclusion SQLite et un dépassement du délai de test sur 10 001 tickets. Un rejeu avec une échéance de test plus longue expose aussi une transaction expirée. Deux profilages, puis le fichier complet avec le code non instrumenté et son délai transactionnel d’origine, passent ensuite ; une observation sépare environ 0,96 seconde de préparation et 0,59 seconde de lecture. `2dcb530` sépare ces mesures et donne trente secondes à ce seul test, préparation comprise. Il ne change aucun délai du produit. Un autre passage sur cette base réutilisée termine 4 041 tests avec succès, une exclusion et trois échecs : les deux lectures volumineuses et le conflit de saisie de temps. La qualification finale utilise donc une autre base PostgreSQL vide, avec réapplication des 73 migrations. Les deux lectures y passent, environ 238 ms pour les tickets et 3,38 secondes pour le planning. La cause de la variation de temps n’est pas prouvée ; ces observations et leurs rapports sont conservés, et la qualification de charge reste ouverte.

Le garde réseau Node est chargé dans les processus de recette ; aucun transport fournisseur réel ni serveur applicatif n’est lancé. Cette exécution Windows ne qualifie pas l’image Linux, un parcours navigateur authentifié, le déploiement de plusieurs travailleurs, une charge concurrente ou la délivrabilité. L’exclusion PostgreSQL concerne uniquement la restauration native d’une sauvegarde SQLite, exécutée dans la suite SQLite.

Le premier build est bloqué par une erreur du lanceur de recette : le garde de démo publique interdit les polices Google requises au build. Le rejeu utilise le garde local existant, qui permet ces seuls GET publics et la boucle locale. Les anciens dossiers de build sont déplacés hors de la copie et conservés ; aucun code applicatif n’est modifié pour cette reprise.

Un audit npm relu le 24 octobre signale [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) : quatre entrées affectées par le même avis Zod, en comptant la chaîne Puppeteer. Les rapports à zéro du 22 octobre restent des observations datées. Les suites de ce reçu utilisent encore l’ancien lockfile. La [qualification suivante](../20261024-zod-security/README.md) installe le correctif Zod 4.6.6 / Puppeteer 25.13.0 dans une copie isolée et rejoue les deux suites complètes ; elle traite cette condition de sécurité et les délais du planning sur son propre code, sans modifier les résultats historiques ci-dessus.
