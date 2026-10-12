# Suppression du brouillon et libération de ses temps

Le diagnostic SQL élargi confirme que Comptabilité ne peut pas supprimer une facture brouillon accessible issue de temps : la mise à NULL de `invoiceId` demande Opérations en écriture. La transaction préserve la facture et les temps ; aucun audit de suppression n'est créé. Le rattachement approuvé pour la création ne couvre pas ce détachement.

## Lot approuvé le 13 octobre 2026

Autoriser uniquement la libération des temps rattachés à la facture brouillon accessible que l'action Finance supprime dans la même transaction, après vérification de société, client, chantier et agence. Aucun détachement vers une autre facture, aucune modification de durée, description ou facturabilité, et aucun droit général Opérations. La facture émise reste protégée. Toute panne conserve facture, lignes et associations.

Le bouton de suppression et sa confirmation actuels restent identiques. Il n'y a ni émission, ni avoir, ni envoi fournisseur. Une régression SQL vérifiera les autres champs, contextes, factures émises et références incohérentes avant un E2E compilé.
