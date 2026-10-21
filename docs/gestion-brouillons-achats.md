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

Ce lot ne livre pas la modification d’une commande soumise, le retrait d’une transmission fournisseur, l’annulation d’une réception, ni la pagination complète de la liste des achats. Ces parcours demandent leurs propres règles et preuves. Aucune migration ni dépendance supplémentaire n’est nécessaire.
