# Fiche Client : qualification des droits, 8 octobre 2026

La lecture CRM de la fiche Client retournait des devis, contrats et factures sans vérifier leurs droits Sales/Finance. Ses relations imbriquées ne filtraient ni leur société ni l’agence du projet lié. Des relations historiques incohérentes pouvaient donc élargir la lecture. Le correctif suit le [contrat approuvé](contrat-fiche-client-droits.md), sans modifier la matrice des permissions.

## Périmètre

`getClientById` exige `crm.read`, relit les droits du membership actif, puis filtre les projets, devis et factures par société et agence attribuée. Les documents sans projet restent accessibles aux lecteurs ayant le périmètre société ; les membres restreints aux agences suivent le périmètre des lecteurs directs existants. Les contrats conservent leur partage dans la société avec `sales.read`.

Les agrégats utilisent le même filtre que les factures. Sans `finance.read`, les montants retournés sont `null`, y compris les deux compteurs financiers mis en cache sur Client. Sans `sales.read`, devis et contrats sont vides. Le client et ses données permises restent lisibles. Les collections et agrégats sont lus dans une transaction Serializable ; les identifiants absents, vides ou trop longs ne déclenchent aucune lecture du premier client.

Les cartes affichent les mentions de restriction approuvées, sans compteur artificiel de zéro. « Créer un devis » exige `sales.write`. Cartes, onglets et styles sont conservés.

## Régression reproductible

La session et l’invalidation Next sont simulées. Memberships, agences, documents, DAL et SQL sont réels dans une base SQLite isolée, avec deux sociétés et trois agences fictives. La relation incohérente est créée sans contexte d’écriture authentifié pour simuler une donnée historique ; les lectures utilisent les vraies actions.

La même suite de dix-sept cas échoue douze fois avec `src/actions/clients/index.ts` du commit `5b72db6e9b96bbe5f35e4e1c8675149ba25b5064`, puis réussit dix-sept fois avec le lecteur corrigé. Elle inclut des documents de la société courante reliés à un projet étranger, pour vérifier que le filtre de société seul ne suffit pas. Le fichier historique a été substitué uniquement dans la copie de recette et restauré après le test. Le worktree n’a pas été remis à une ancienne révision. Les [résultats et empreintes](evidence/20261008-client-permissions/summary.json) relient les deux exécutions au même fichier de test.

Dans une recette isolée préparée avec le lockfile et une base neuve, exécuter :

```sh
npm run test:unit -- tests/unit/client-read-scope.integration.test.ts
```

Pour reproduire l’état antérieur, conserver ce même test dans une copie du candidat et remplacer uniquement le lecteur par sa version du commit ci-dessus. Ne pas employer la base ou les secrets d’une instance existante.

Les cas couvrent Owner/Admin, Comptabilité, Commercial, Viewer, Technicien et SAV ; l’agence désactivée ou retirée ; membership suspendu ; client étranger ; identifiants invalides ; lecture en démo ; compteurs périmés. Les parcours navigateur préparés vérifient Owner, Commercial et Technicien sur ordinateur et mobile, avec deux sociétés fictives séparées. Leur découverte locale ne prouve pas leur exécution : la qualification PostgreSQL et navigateur doit encore être obtenue sur ce candidat.

## Limites

La suite commune locale réussit 953 tests dans 159 fichiers en 158,30 secondes, types, ESLint et Oxlint. Le cas de relation incohérente supplémentaire passe ensuite dans la même suite ciblée de dix-sept cas. Build réussi : compilation 20,4 secondes, types 11,3 secondes, 75 pages générées. Schéma PostgreSQL validé sans connexion ; 182 E2E dans 41 fichiers découverts, dont les six nouveaux parcours Client. Aucune de ces découvertes n’est annoncée comme une exécution navigateur.

Ce correctif porte sur le lecteur de la fiche et sa présentation. L’annuaire Client, ses autres lecteurs, ses commandes, contacts, fichiers, activités et portail restent des périmètres distincts. Les plafonds d’historiques de cette fiche ne sont pas changés. Ce résultat ne qualifie pas tous les accès CRM ni un incident en production. Aucun fournisseur réel, courriel ou paiement n’a été déclenché.
