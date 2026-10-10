# Factures récurrentes : droits et périmètre

Le diagnostic sur `13a89e7`, rejoué sur `ae88e47`, reproduit six défauts sur huit cas : lecture sans Finance, chantier d’une autre agence et client d’une autre société. Les fixtures créent directement les relations incohérentes ; elles ne démontrent pas leur création par les mutations actuelles. Les [rapports avant correction](evidence/20261009-recurring-read/README.md) conservent les deux contrôles positifs.

## Correction approuvée

`565986e` exige `finance.read` pour la page, les listes et les sélecteurs, puis `finance.write` pour créer, activer ou supprimer. Le chantier devient une relation vérifiable. Le périmètre de lecture est appliqué avant comptage et pagination : société, client, agences du chantier et du site d’entretien. Un JSON historique incohérent reste inaccessible et ne devient pas un modèle global.

La migration reprend uniquement les anciens chantiers cohérents. Les modèles sans chantier ni entretien restent réservés à Owner/Admin. Les rôles limités aux agences doivent choisir un chantier à la création. Recherche, pages de 25 et choix conservé couvrent les modèles, clients et chantiers. Le worker vérifie le rattachement relationnel et le site d’entretien avant toute facture ; un refus conserve l’échéance et l’activation. Les factures existantes sont conservées lors de la suppression d’un modèle.

## Qualification locale

Les [preuves de `565986e`](evidence/20261009-recurring-read/local.json) passent :

- 26 cas SQL de périmètre, migration, droits, révocation, démo et volumes de 530 modèles/clients/chantiers ;
- 13 cas du worker et 33 cas Documents, soit 72 contrôles ciblés ;
- 1 436 tests SQLite dans 177 fichiers, types, les deux lints et build de 75 pages.

Les [deux CI de 0f45087](evidence/20261009-recurring-read/ci-0f45087.json) qualifient ensuite ce code : 1 435 tests PostgreSQL et une exclusion native SQLite, 1 436 SQLite dans chacune des deux suites, 277 E2E et 19 exclusions historiques, neuf contrôles Linux et audits à zéro. Les 26 cas de périmètre, 13 cas worker et 33 cas Documents passent sur PostgreSQL ; les huit nouveaux E2E Récurrences et six Documents passent sur ordinateur/mobile. Types, lints, build et couverture réussissent. La migration PostgreSQL est appliquée sur base neuve et son UPDATE historique est rejoué dans la suite SQL.

Le [contrat approuvé](contrat-factures-recurrentes-droits.md) précise les comportements visibles. Les [preuves antérieures du worker](evidence/20261009-recurring-generation/README.md) restent attachées à leur code ; elles ne qualifient pas ce nouveau lecteur. Concurrence multi-processus, interruption réelle et toute la chaîne d’émission restent des vérifications distinctes.
