# Actions des factures : droits et cohérence client

## Défauts reproduits

Le premier diagnostic sur `d1cd591` échoue dans 17 cas et passe six témoins positifs. La reproduction finale, après extension des tests, échoue dans 29 cas sur 43 : 27 des 34 cas des actions et deux des neuf cas des relances. Ces nombres incluent des refus trop tardifs ; ils ne désignent pas 29 écritures illégitimes réussies. Les vraies actions, le DAL et SQL s'exécutent dans une base fictive isolée. Session, cache, générateur d'archive et transport fournisseur sont simulés : ce diagnostic ne qualifie ni le rendu PDF ni un compte mail réel.

- L'annuaire des factures et les temps non facturés acceptent des relations vers un client d'une autre société.
- Quatre rôles sans Finance peuvent lire les temps non facturés et leur estimation.
- Cinq rôles sans écriture Finance lisent une facture avant que le DAL refuse le paiement. Ce sont des refus tardifs, pas cinq paiements autorisés.
- L'émission, le paiement, l'avoir, la préparation de relance et la suppression d'un brouillon acceptent une facture dont le client appartient à une autre société.
- Un avoir d'une autre société lié à une facture locale réduit son montant disponible.

## Correction proposée

Les lectures financières exigent `finance.read`, les créations et modifications `finance.write`, avant toute lecture métier. La matrice des rôles reste identique. Les factures dont le client appartient à une autre société sont exclues des listes et refusées par les actions avec le message existant « Facture introuvable ». Les temps facturables exigent un chantier et un client de la société. Le calcul d'avoirs ne prend que les factures d'avoir de la société et du client de l'original.

Les contrôles d'agence existants restent applicables. Les témoins préservent les paiements Owner/Admin/Accounting, les lectures Viewer, l'émission, les relances autorisées et la limite des avoirs cohérents. Les refus des factures incohérentes laissent soldes, paiements, relances, avoirs et appels au générateur inchangés. Le mode public refuse les écritures avant les lectures métier.

Une relance préparée est également contrôlée à la lecture, puis juste avant l'expédition. Le contrôle préexistant du destinataire empêchait déjà l'envoi dans les deux cas reproduits ; le correctif rejette désormais la relation incohérente avant création de la commande, ou dans la dernière relecture de facture. Les sélections du processeur automatique portent aussi sur un client de la société.

## Effet visible approuvé

Une tentative sans droit Finance reçoit le refus de droits avant la lecture de la facture. Les factures et temps incohérents disparaissent des listes concernées ; les commandes financières sur ces factures répondent « Facture introuvable ». Aucun composant, champ, bouton, couleur ou emplacement n'est changé.

Le propriétaire a approuvé ce lot le 9 octobre 2026. Le correctif `e13d3d7` passe la [recette locale et les deux CI de de24513](evidence/20261009-invoice-actions/README.md) : 1 472 SQLite, 1 471 PostgreSQL et une exclusion native, 277 E2E et 19 exclusions historiques, neuf contrôles Linux et audits à zéro. Cette suite ne couvre ni des services externes, ni une charge hébergée, ni tous les remboursements ou la concurrence des avoirs.
