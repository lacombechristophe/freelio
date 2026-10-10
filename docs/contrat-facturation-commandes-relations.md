# Facturation d'une commande : cohérence des rattachements

## Diagnostic sur 3f1ca72

La recette SQL fictive passe deux témoins cohérents et échoue dans six refus attendus : pour l'acompte et le solde, une commande locale portant un client étranger, un chantier local dont le client est étranger ou un chantier d'une autre société produit actuellement un brouillon de facture. La commande change d'état de facturation et une trace est créée. Les fixtures incohérentes sont insérées directement dans SQL ; ce résultat ne prouve pas que les formulaires actuels les créent. La création manuelle de commande vérifie déjà le client du chantier.

Session et cache Next sont simulés ; action, DAL, transactions, facture et audit sont réels. Aucun PDF, archive, envoi ou compte fournisseur n'est utilisé.

## Correctif approuvé le 9 octobre 2026

Avant de calculer ou créer l'acompte ou le solde, vérifier que le client appartient à la société, que le chantier éventuel et son client appartiennent à la société, et que ce chantier correspond au client de la commande. Recontrôler ces relations au moment où la transaction revendique la commande. Conserver le contrôle Finance préalable, les agences accessibles et la protection contre deux facturations concurrentes.

Une commande incohérente reçoit le message existant « Commande client introuvable », sans création de facture, modification de la commande ni nouvel audit. Les parcours cohérents, avec ou sans chantier selon les droits d'agence, restent disponibles. Aucun champ, bouton, couleur ou emplacement ne change.

La suite maintenue devra vérifier les deux modes, les rattachements, les rôles Finance, la démo publique, la révocation d'agence et le refus sans effet de bord. Qualifier sur SQLite et PostgreSQL réel. La cohérence des anciennes factures liées et la contention forte restent distinctes ; aucun remboursement ou envoi ne fait partie de ce lot.
