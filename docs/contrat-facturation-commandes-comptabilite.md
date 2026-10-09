# Facturation des commandes par le rôle Comptabilité

## Diagnostic sur 3f1ca72

Six appels réels sont vérifiés, avec commandes et rattachements cohérents, dans une base fictive : Owner et Admin créent leurs brouillons d'acompte et de solde, tandis que Comptabilité reçoit `FORBIDDEN:operations.write` dans les deux cas. La lecture de la liste indique pourtant `canBillOrders: true`. La transaction échoue avant création de facture. Les précédentes recettes de visibilité ne qualifiaient pas cette création effective par Comptabilité.

Session et cache Next sont simulés ; rôles, rattachements, DAL et transactions SQL sont réels. Aucun PDF, émission, paiement ou fournisseur n'est utilisé.

## Correctif approuvé le 9 octobre 2026

Conserver la matrice des rôles. Dans une action autorisée par `finance.write`, permettre à Comptabilité le seul changement de `CustomerOrder.billingStatus` nécessaire à la revendication de la facturation, par `updateMany`. La société et les agences restent filtrées. Ne pas autoriser les autres champs, les données mixtes, la création/suppression de commande, le stock ou une mutation hors contexte Finance.

Les boutons de facturation déjà affichés fonctionnent ainsi pour une commande cohérente et accessible. Owner/Admin conservent leur parcours ; Viewer et les rôles sans Finance restent refusés, ainsi que les écritures en démo publique. Aucun bouton, champ, message, couleur ou emplacement nouveau n'est ajouté.

Vérifier acompte/solde réels pour les trois rôles Finance, refus des autres mutations, des agences retirées et du mode public. Qualifier sur SQLite, PostgreSQL et dans le navigateur compilé avec des factures brouillons fictives. La cohérence des références fait l'objet du [lot distinct](contrat-facturation-commandes-relations.md) ; la contention forte, l'émission et les paiements restent séparés.
