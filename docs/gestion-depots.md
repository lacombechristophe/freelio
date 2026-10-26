# Gestion des dépôts

Le Centre des opérations donne accès à un annuaire des dépôts, actifs et inactifs, avec recherche par nom, code ou adresse et pages de 25. L'accès suit les droits Opérations et les agences du membre. Une relation vers une agence étrangère est exclue, même pour le propriétaire de la société.

## Coordonnées et activité

La modification porte sur le nom, le code et l'adresse. Le code reste unique dans la société. Le formulaire conserve la version affichée à son ouverture : une modification concurrente provoque un refus sans écrasement, et la saisie reste présente. Le rattachement d'agence reste géré par le parcours d'administration existant ; l'édition des coordonnées n'accorde aucun droit supplémentaire sur les agences.

Une désactivation exige un dépôt vide : aucune quantité en stock, aucune quantité réservée et aucune réservation active. Les quantités négatives et les incohérences historiques de propriété d'une ligne de stock bloquent aussi cette opération. Le refus annule la modification d'activité, sa révision et son audit dans la même transaction. Une réactivation rend le dépôt utilisable sans modifier son historique. Aucun dépôt ni document lié n'est supprimé.

Les commandes sont réservées à `operations.write`, avec vérification côté serveur. La démonstration publique les interdit aussi si une requête est envoyée directement.

## Écritures de stock

Une vérification préalable du dépôt ne suffit pas lorsqu'il est désactivé pendant la préparation d'une réception ou d'un mouvement. Les écritures concernées verrouillent désormais sa ligne et revérifient son activité dans la transaction. Les transferts prennent leurs deux verrous dans l'ordre des identifiants ; la clôture terrain utilise le même ordre pour son matériel. Ce verrou ne modifie pas la révision des coordonnées.

La protection couvre mouvement, transfert, nouvelle réservation, consommation en intervention, réception, retour fournisseur et acceptation d'une anomalie fournisseur. Elle couvre également la clôture terrain avec matériel et les imports de mouvements, réservations et réceptions. Les résolutions de réservations existantes restent disponibles selon leurs droits et règles actuelles.

L'import disposait déjà d'une transaction par enregistrement source. La vérification du dépôt utilise cette transaction, avec le document, le stock et son mapping. Un dépôt inactif ou une désactivation importée incompatible avec le stock fait échouer le lot ; l'enregistrement brut est conservé et n'est pas marqué importé. Les enregistrements validés avant ce refus restent conservés pour la reprise. Cette règle ne réactive pas silencieusement un dépôt et ne garantit pas l'intégrité de tous les autres types d'import.

## Vérification

Les [tests de stock](../tests/unit/warehouse-stock-lifecycle.integration.test.ts) reproduisent les désactivations intercalées entre préparation et transaction, avec témoins nominaux et absence de modification des documents/quantités après refus. Les [tests d'import](../tests/unit/warehouse-import-lifecycle.integration.test.ts) vérifient la conservation du brut et le rejeu sans doublon. Les [tests de gestion](../tests/unit/warehouse-management.integration.test.ts) couvrent 203 dépôts, les versions, droits, sociétés/agences, stock et réservations. Auth.js et le cache Next sont simulés ; actions, transactions, contraintes et données sont réels dans une SQLite isolée.

La [recette locale](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/evidence/20261019-warehouses/README.md) passe les 45 cas dédiés puis 2 501 tests sur une base neuve, ainsi que types, deux lints et build. Le [parcours navigateur](../tests/e2e/warehouse-management.spec.ts) prépare pagination, conflit avec saisie conservée, édition, désactivation/réactivation et refus avec stock. Sa présence et sa sélection ne prouvent pas son exécution. PostgreSQL, navigateurs compilés et déploiement du nouveau code restent à qualifier avant fusion.
