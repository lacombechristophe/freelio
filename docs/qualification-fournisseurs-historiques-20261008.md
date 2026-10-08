# Historiques et indicateurs fournisseurs

Les trois historiques lisent des pages de 25 dans des transactions Serializable. Comptage, filtre et page appartiennent au même instant de lecture ; l’identifiant départage les dates ou libellés identiques. Chaque action relit le fournisseur, la société, la permission et les agences du membre. Le stock conserve ses restrictions par entrepôt, les retours celles de leur entrepôt et commande. Aucun prix historique inutilisé n’est transporté.

Les cartes utilisent des agrégats SQL indépendants des trois recherches. Les achats excluent les commandes annulées ; le nombre de commandes les inclut, comme auparavant. La ponctualité porte sur les commandes ayant une date de réception et privilégie la date confirmée, puis prévue ; sans échéance, la réception compte à l’heure. Les comparaisons de dates utilisent les références de colonnes Prisma, sans charger tout l’historique ni ouvrir une exception de SQL brut. Les anomalies non résolues et références actives/inactives sont comptées dans leur périmètre complet.

Le client masque la page précédente pendant une nouvelle lecture et ignore les réponses d’une recherche abandonnée. Chaque bloc garde son filtre et sa page ; une erreur affiche la commande de reprise existante, sans annoncer une liste vide. Les cartes, liens et colonnes sont conservés conformément au [lot approuvé](contrat-fournisseurs-historiques.md).

## Vérifications

Recette SQL isolée : 301 produits, 101 commandes et 101 retours fictifs, dont les résultats au-delà des anciens plafonds. Dix-neuf cas vérifient les totaux, échéances confirmées, dernière page, recherche d’un avoir ancien, filtres indépendants, page ramenée dans ses bornes, fournisseur vide, société étrangère, révocation, démo et entrées bornées. Les neuf tests existants de stock et d’agences restent réussis après adaptation au contrat paginé.

Le contrôle de composition des filtres ajoute une ancienne commande liée à un chantier d’une autre société : recherche et ponctualité doivent conserver la restriction de société au lieu de remplacer son OR. Les conditions sont combinées par AND ; la ligne incohérente est exclue des pages et de chaque indicateur.

La première préparation de cette recette utilisait un champ `archived` absent du modèle Product ; elle échouait avant ses assertions. Le fixture utilise désormais le champ `active` réel et son nettoyage supporte une préparation interrompue. Les 24 cas ciblés passent sans modifier les délais ou exclusions. Une répétition ultérieure échoue sur un test qui attribuait à Comptabilité une interdiction de lecture inexistante (925 autres cas réussis). La matrice des permissions reste inchangée ; les tests vérifient désormais les restrictions d’agence de ce rôle et le refus sans session.

La suite finale réussit **928 tests dans 157 fichiers en 139,23 secondes**, types, ESLint et Oxlint. Le build compile et génère **75 pages** ; la validation du schéma PostgreSQL sans connexion passe. La découverte de **176 E2E / 40 fichiers** prouve uniquement leur chargement. Le contrôle de publication inspecte 981 fichiers sans finding. Les 19 cas d’historiques et neuf cas d’agences en font partie.

Deux parcours par format sont préparés : accès aux dernières pages des trois historiques avec cartes invariantes, puis interruption d’une lecture et reprise explicite. Leur découverte locale ne constitue pas une exécution navigateur. La CI du nouveau candidat reste à obtenir.

La CI de [branche 1e5e3bc](https://github.com/lacombechristophe/freelio/actions/runs/37773059619) et sa [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37773066937) ont réussi le lot d’annuaire et les corrections Banque précédents ; elles ne qualifient pas ces nouveaux historiques ni le correctif d’import concurrent e18da50.

Ces lectures ne démontrent ni charge hébergée, ni résolution de la concurrence des rapprochements/paiements. Main et la démo hébergée restent une livraison distincte.

## Résultat CI et isolation de la recette

Les CI de [branche 5616823](https://github.com/lacombechristophe/freelio/actions/runs/37777822124) et de [PR](https://github.com/lacombechristophe/freelio/actions/runs/37777827194) échouent : respectivement 150 et 149 E2E réussis, cinq et six échecs, 19 exclusions historiques. PostgreSQL réussit 927 tests avec une exclusion native SQLite ; Linux réussit. Les 19 cas SQL d’historiques et les quatre nouveaux parcours fournisseur passent.

Les volumes fournisseurs avaient été ajoutés à la société commune à tous les parcours. Son catalogue sans pagination dépasse alors le budget de capture UI et affecte les tests de navigation. Deux sélecteurs anciens rencontrent aussi plusieurs boutons « Enregistrer » ; la PR rencontre deux notifications identiques après les transferts successifs. Ces échecs restent conservés dans les exécutions ci-dessus.

La recette suivante conserve 301 produits, 101 commandes et 101 retours par format, mais les place dans deux sociétés fictives distinctes, avec leurs sessions propres. Les captures complètes des premières pages et des historiques filtrés sont publiées ; les tests de transfert vérifient leurs directions persistées, en plus des notifications. Aucun délai, exclusion ou seuil n’est assoupli. La suite locale commune réussit 936 tests / 158 fichiers en 134,71 secondes ; nouvelle CI navigateur requise.

Cette isolation rétablit l’indépendance des parcours et ne résout pas le catalogue général à plus de 600 produits. Sa pagination serveur est une proposition distincte dans le [contrat Catalogue](contrat-catalogue-volume.md), soumise à confirmation visible.

Le correctif de recette **8d988ca** passe types, ESLint et Oxlint. Le build compile en 17,3 secondes et génère 75 pages, le schéma PostgreSQL est validé sans connexion et les 176 E2E / 40 fichiers restent découverts. Ces contrôles locaux ne remplacent pas l’exécution des nouvelles connexions et captures dans la CI navigateur.

## Contrôle mobile supplémentaire

La [CI de PR 41238b0](https://github.com/lacombechristophe/freelio/actions/runs/37785164370) passe PostgreSQL (935 réussites, une exclusion native SQLite), Linux et 154 parcours navigateur ; 19 exclusions historiques restent présentes. Elle échoue sur la nouvelle assertion de largeur du catalogue fournisseur en mobile : son bord atteint 589 pixels pour un viewport de 412. Les échecs de sélecteurs et de capture Catalogue précédents ne réapparaissent pas. Les audits généraux parcourent 65 routes par format sans finding ; ils ne remplaçaient pas cette nouvelle vérification de la fiche avec volume.

Le correctif ajoute uniquement `min-w-0` aux deux colonnes de la fiche : elles peuvent réduire leur largeur dans la grille, au lieu d’imposer la largeur intrinsèque de leur contenu. Cartes, proportions desktop, commandes et couleurs sont conservées. La même assertion et les captures complètes restent obligatoires. Build local de 75 pages réussi (compilation 15,5 secondes), schéma PostgreSQL validé sans connexion et 176 E2E / 40 fichiers découverts. Nouvelle exécution navigateur requise.

La [CI de PR 5b72db6](https://github.com/lacombechristophe/freelio/actions/runs/37789514796) réussit : 936 SQLite, 935 PostgreSQL et une exclusion native SQLite, 155 E2E réussis et 19 exclusions historiques, image Linux et audits. Les quatre parcours historiques fournisseur passent, avec l’assertion mobile conservée. Les captures des premières pages et recherches filtrées sont publiées dans l’artifact `ui-audit-reports`. Le commit testé est la fusion synthétique `f46fd7e091d3a1ccd7e48813bd81ca9f4d43cd47`, parents main `0e910948` et candidat `5b72db6`.

La [CI de branche du même candidat](https://github.com/lacombechristophe/freelio/actions/runs/37789506198) passe aussi PostgreSQL, Linux et les quatre parcours fournisseur, mais échoue ailleurs : 154 E2E réussis et un délai dépassé au menu de désinscription dans le parcours commercial. Cette exécution reste rouge ; le succès de PR ne la remplace pas. Le correctif Client suivant nécessite sa propre qualification.
