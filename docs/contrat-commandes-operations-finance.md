# Données de facturation des commandes dans Opérations

## Diagnostic du 9 octobre 2026

Sur `f88fa41`, une [recette SQL isolée de dix cas](evidence/20261009-operations-order-finance/baseline.json) reproduit neuf défauts : TECHNICIAN, OPERATIONS et SERVICE reçoivent les références de factures, leur compteur et le statut de facturation via `getOperationsDashboard`, malgré l'absence de `finance.read`. Le contrôle Owner conserve une facture locale attendue. Client, chantier, agence, commande et facture sont cohérents ; session et cache Next sont simulés, les lectures SQL et le DAL sont réels.

La page Opérations affiche le statut de facturation et propose des commandes de facturation qui s'appuient sur ces références. Les gardes d'écriture existantes ne justifient pas cette lecture. Le diagnostic ne prouve pas qu'un rôle interdit peut créer une facture.

## Lot approuvé

Sans `finance.read`, ne pas charger ni retourner les factures de la commande et leur compteur ; retourner un statut de facturation indisponible. Dans le badge existant, afficher « Accès Finance requis ». Réserver les commandes « Facturer l'acompte » et « Facturer le solde » à `finance.write`. Conserver la commande, ses lignes, son statut opérationnel, ses prix, les réservations et les livraisons ; la qualification de leurs propres droits est distincte.

Le propriétaire approuve ce lot le 9 octobre 2026. Les couleurs et la disposition générale sont conservées. Seize cas SQL vérifient les trois rôles en défaut, Owner/Admin/Accounting, Viewer avec lecture sans écriture, une rétrogradation, la révocation d'agence et la démo publique. Six parcours navigateur sont préparés pour Owner/Technician/Viewer, sur ordinateur et mobile. Leur exécution compilée reste requise ; le chargement des tests ne vaut pas exécution. Les autres relations financières d'Opérations restent un périmètre séparé.
