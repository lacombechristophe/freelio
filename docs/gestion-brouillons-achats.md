# Brouillons et annulation des achats fournisseur

Une commande brouillon peut être corrigée depuis sa carte Opérations ou son dossier : fournisseur, chantier, livraison souhaitée, instructions et lignes. Le numéro reste identique. Une ligne conservée garde son identifiant et sa référence d’import ; ses prix négociés ne sont pas remplacés par le prix du catalogue. La recherche et la pagination des choix restent disponibles.

L’annulation est une transition, sans suppression. Elle exige un motif et une confirmation que la commande n’a pas été transmise. Elle est disponible en `DRAFT`, `PENDING_APPROVAL` et `APPROVED` ; ce dernier état exige aussi `purchases.approve`. Une commande envoyée, réceptionnée, comportant une anomalie ou un retour ne passe pas par cette action. Aucun contact fournisseur, mouvement de stock, avoir ou remboursement n’est déclenché. « Marquer envoyée » reste un enregistrement de transmission externe, sans transport e-mail implicite.

## Invariants

- `operations.write` est exigé avant lecture métier. Les références initiales et remplacées doivent appartenir à la société et au périmètre d’agences autorisé. Un rôle limité aux agences conserve un chantier accessible.
- Les nouvelles références doivent être actives. Les quantités sont des entiers positifs, les prix des centimes entiers et le total doit tenir dans un entier SQL signé de 32 bits. Une date impossible est refusée.
- La révision affichée couvre le parent et ses lignes. Une saisie périmée, un changement d’état ou une modification concurrente empêche l’écrasement. La transaction est sérialisable et sa prise conditionnelle vérifie aussi l’état et la date de modification ; cette dernière augmente même pour deux éditions dans la même milliseconde.
- Les écritures métier et l’audit appartiennent à une transaction unique. Un échec de l’audit annule également la modification. Les champs d’approbation et toutes les lignes sont conservés lors de l’annulation.
- Les références historiques contradictoires restent conservées et refusées. Ce parcours ne répare ni ne réaffecte automatiquement des données.
- Le formulaire reste ouvert avec sa saisie après un refus. Sa révision est capturée à l’ouverture : une actualisation ne donne pas silencieusement à une ancienne saisie le droit d’écraser une édition plus récente.
- Les actions sont interdites dans la démo publique en lecture seule. Les nouvelles commandes de modification et d’annulation sont masquées sans droit d’écriture.

## Vérification

La suite SQL [purchase-draft-lifecycle.integration.test.ts](../tests/unit/purchase-draft-lifecycle.integration.test.ts) utilise les vraies actions et SQLite, avec authentification/cache simulés. Elle couvre les états, les droits, les références étrangères, les validations, deux éditeurs concurrents et le rollback après refus réel d’une insertion d’audit par un trigger SQL fictif. Les [tests de création](../tests/unit/purchase-creation-integrity.integration.test.ts) et de [choix](../tests/unit/purchase-choices.integration.test.ts) restent distincts.

Le [scénario navigateur](../tests/e2e/purchase-creation-integrity.spec.ts) prépare création, édition, refus d’une ancienne révision avec saisie conservée et annulation motivée sur desktop et mobile. Sa présence ou sa sélection ne prouve pas son exécution. Les résultats du candidat doivent être reliés au [registre de qualification](completude-recette-20261003.md).

## Historique et synthèse

La liste générale recherche avant pagination dans les numéros, fournisseurs, chantiers, références fournisseur, libellés des lignes et références produit. Le filtre d’état se combine à la recherche et au filtre d’agence. Les pages contiennent 25 commandes, avec un tri stable par date puis identifiant ; une page devenue vide est ramenée à la dernière page disponible.

Le compteur d’achats actifs porte sur tout le périmètre autorisé, indépendamment de la page et de la recherche. Il conserve la définition existante : tous les états sauf `RECEIVED` et `CANCELED`. La synthèse présente au plus cinq achats actifs, avec le total explicite ; des commandes fermées plus récentes ne les masquent plus. Un filtre d’agence exclut les approvisionnements généraux sans chantier. Seuls Owner/Admin les consultent sans ce filtre.

Les fenêtres de création, modification, accusé, réception et retour sont conservées indépendamment des cartes paginées. Une actualisation de la liste ne remplace pas leur saisie ni la révision capturée à l’ouverture. Les erreurs de lecture gardent la recherche et le filtre ; la pagination propose une reprise. Ce comportement est préparé dans le scénario navigateur et demande encore son exécution.

## Soumission, approbation et accusé fournisseur

Les quatre transitions partagent le périmètre des lecteurs : société, fournisseur, produits, approbateur, client/site du chantier et agences. `operations.write` reste nécessaire pour soumettre, marquer envoyée ou enregistrer l’accusé ; `purchases.approve` permet l’approbation, y compris pour Comptabilité sans droit général de modification des achats.

La version préparée couvre aussi les lignes. La transaction relit cette version et les références, puis revendique l’état et la date de modification avant de créer l’audit. Une réception terminée pendant la préparation de l’accusé reste réceptionnée ; une modification de ligne qui ne touche pas le parent est également détectée. Des traces de réception, d’anomalie ou de retour contredisant l’état empêchent ces transitions. Un échec de l’audit annule la transition. L’accusé exige un jour canonique `YYYY-MM-DD`, sans normalisation d’un jour impossible.

Les suites [historique complet](../tests/unit/purchase-directory.integration.test.ts) et [transitions](../tests/unit/purchase-transitions.integration.test.ts) couvrent ces règles avec SQL réel. Les intercalages déterministes placent une modification SQL achevée entre préparation et transaction ; ils ne représentent pas une mesure de charge ni une qualification de concurrence native PostgreSQL. Les [preuves du complément](evidence/20261021-purchase-workflow/README.md) distinguent les diagnostics initiaux, la suite complète et les parcours non exécutés.

La modification d’une commande soumise, le retrait d’une transmission fournisseur et l’annulation d’une réception restent des parcours distincts. Aucune migration ni dépendance supplémentaire n’est nécessaire pour ces compléments.
