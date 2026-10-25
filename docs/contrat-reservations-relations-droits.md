# Réservations et références client cohérentes

## Diagnostic

Sur `88ce8dd`, le premier diagnostic donne six échecs et deux témoins positifs. La [reproduction finale](evidence/20261009-stock-reservation-scope/baseline.json) comporte douze cas : neuf échecs et trois réussites. Un chantier ou une commande de la société peut être lié, dans les fixtures, à un client d'une autre société. Les actions acceptent la création d'une réservation par cette référence et la libération/consommation d'une réservation historique portant cette référence. Trois cas supplémentaires reproduisent une commande locale liée au chantier d'un autre client local. Ces opérations modifient réellement l'inventaire et créent des mouvements dans la base fictive.

Les fixtures créent les incohérences directement en SQL : la recette ne prouve pas qu'un formulaire courant permet de construire ces relations. Session et cache Next sont simulés ; actions, DAL, transactions et données persistées sont réels. La recette de concurrence est distincte.

## Correction approuvée

À la création, un chantier doit appartenir à la société et son client aussi. Une commande doit appartenir à la société, ainsi que son client et, lorsqu'il existe, son chantier ; le chantier doit correspondre au client de la commande. Les contrôles d'agence existants restent applicables.

Pour libérer ou consommer une réservation existante, ses références présentes doivent passer les mêmes contrôles avant la transaction. Une référence incohérente ne sera pas remplacée automatiquement. Le refus conserve le stock, l'état ACTIVE, sa révision, la commande et l'historique ; une correction administrative de la référence reste une opération distincte.

## Effet visible approuvé

Le propriétaire a approuvé ce lot le 9 octobre 2026. Les commandes et leur aspect sont conservés ; la création est refusée avec les messages existants « Chantier introuvable » ou « Commande client introuvable », puis les commandes sur une réservation incohérente avec « Réservation active introuvable ». Aucun bouton, champ, couleur ou emplacement n'est ajouté ou modifié.

Les douze cas des rattachements et douze de concurrence passent en SQLite, avec les parcours cohérents chantier seul, commande seule et les deux références, libération, nouvelle réservation et consommation. Les refus conservent soldes, état et mouvements. La [qualification locale](evidence/20261009-stock-reservation-scope/local.json) du correctif `e25c8d1` compte 1 496 tests dans 180 fichiers ; types, ESLint, Oxlint et compilation passent. Un premier échec du test de migration et sa reprise sont conservés dans cette preuve, sans modification du test ni de son délai. La CI de ce nouveau correctif reste requise. Achats, réceptions, retours et cohérence de tous les autres mouvements restent distincts.

## Recontrôle et audit transactionnels — 21 octobre

Le [complément de qualification](evidence/20261021-stock-reservations/README.md) distingue les défauts de préparation et d’audit des protections de solde déjà présentes. Les références sont désormais relues dans la transaction sérialisable : société et agences, client, chantier/site, commande/devis, produit/fournisseur. Une nouvelle réservation exige encore un dépôt et un produit actifs. Une référence modifiée après la préparation ne crée aucun nouveau mouvement ; sa modification reste conservée.

Avant libération ou consommation, la réservation est relue avec son périmètre complet. Révision, quantités, dépôt, produit, rattachements et notes doivent encore correspondre à la préparation, y compris lorsqu’un changement SQL garde le même horodatage. La revendication conditionnelle de l’état ACTIVE et celle du solde restent appliquées ; un rejeu ne crée aucun second mouvement ni audit terminal.

Création, libération et consommation écrivent leur audit dans la transaction métier. Un refus d’insertion de cet audit annule réservation, mouvement, solde et éventuel passage de la commande en préparation. Le cycle création/libération puis création/consommation produit quatre mouvements et quatre audits. Une erreur Prisma de sérialisation est signalée comme stock modifié ; le scénario de cette erreur reste simulé dans la recette SQLite.

Les commandes et leurs présentations sont conservées. Ce complément ne modifie pas la politique d’annulation/clôture des commandes, ne libère aucun ancien stock automatiquement et ne répare pas les rattachements historiques. Les sélecteurs, la qualification concurrente PostgreSQL et le parcours navigateur préparé restent distincts. Aucune migration ni aucun envoi externe.

## Choix de commande et de chantier — 21 octobre

Les deux champs de création disposent de recherche, total et pages de 25 sur leur périmètre autorisé. La sélection est relue séparément de la page et de la recherche ; les autres saisies restent montées. Une recherche en cours, une erreur ou une sélection non vérifiée bloque l’enregistrement quand cette référence est choisie, sans la remplacer par le premier résultat. Au moins un rattachement reste obligatoire. Les réponses obsolètes sont ignorées et une actualisation des données relance la vérification.

Les filtres d’état et le périmètre global du formulaire sont conservés ; la politique serveur d’allocation n’est pas modifiée. Les [preuves](evidence/20261021-reservation-choices/README.md) distinguent les 29 contrôles SQL des interactions navigateur préparées. Les autres usages du chargement général de chantiers restent distincts.
