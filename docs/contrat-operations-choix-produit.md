# Choix Produit du Centre des opérations

Le diagnostic SQL conservé dans docs/evidence/20261013-operations-client-choices montre que le 501e produit actif de la société n'est pas renvoyé par getOperationsDashboard. Les formulaires consomment cette liste sans recherche serveur. Le contrôle de société passe.

Lot approuvé : recherche par référence/libellé, total et pages de 25 dans les choix Produit des créations Équipement, Mouvement de stock, Transfert de stock, Commande client et Réservation de stock, ainsi que dans Matériel utilisé en intervention. Garder le select natif et conserver sélection et autres saisies hors page, après panne ou actualisation. Bloquer l'enregistrement ou la consommation tant qu'une sélection n'est pas vérifiée ; permettre son remplacement si elle n'est plus proposée. Conserver les filtres actuels (actifs ; suivi du stock pour Transfert et Matériel), les couleurs, champs de quantité/prix, dépôts et boutons métier.

Ce lot ne qualifie pas les cartes ou le tableau de stock, ni les autres listes et sélecteurs. Leur payload Produit peut donc encore rester borné pour ce périmètre séparé. Aucun mouvement réel, envoi, connexion fournisseur ou changement de droits.

Recette prévue : véritable SQL pour pagination stable, dernière référence, recherche, sélection séparée, disparition, société et rôles ; fixtures fictives indépendantes ; navigateur compilé sur ordinateur/mobile pour les six parcours, champs conservés après panne et choix disparu, mutations cohérentes et refus publics. Les sorties de stock utilisent uniquement des quantités fictives dans la base isolée.

Accord utilisateur du 13 octobre 2026 : « Oui, compléter ces six choix Produit ».
