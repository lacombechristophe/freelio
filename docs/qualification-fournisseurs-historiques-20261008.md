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
