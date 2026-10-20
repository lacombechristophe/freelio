# Réserver un rendez-vous CRM depuis le portail

Le choix retenu est un rendez-vous CRM lié à un membre de l’équipe. Une confirmation ne crée pas une intervention terrain et n’exige pas un site. Le client transmet une préférence ; l’équipe choisit ensuite un membre et un créneau réellement réservé. Les interventions SAV gardent leur parcours propre.

## Réservation et accès

La confirmation doit renseigner le membre, le début, la durée et la fin dans le fuseau de la société, puis réserver cette capacité dans la même transaction que le changement d’état et l’audit. La demande et son client doivent appartenir à la société ; le membre doit être actif et accessible au demandeur. Le parcours conserve `crm.write` sans donner de droit général de gestion des membres.

Les anciens états « Confirmé » sans réservation sont signalés comme historiques ; aucun créneau ou membre n’est inventé. Une demande confirmée peut être replanifiée avec une version attendue. Une annulation libère sa capacité en conservant le rendez-vous et la trace. Les doubles confirmations et les formulaires périmés ne créent pas deux réservations.

## Conflits

Deux rendez-vous CRM d’un même membre ne peuvent pas se chevaucher. Les créneaux terrain du membre doivent également être pris en compte, dans les deux sens. L’écriture de ces deux parcours doit utiliser le même verrou de ressource ; une vérification avant transaction ne suffit pas. Les bornes sont semi-ouvertes : la fin d’un rendez-vous peut coïncider avec le début du suivant.

Le contrôle d’une donnée privée retourne un refus générique, sans son titre ni l’identité de son client. Un calendrier distant n’est pas présenté comme disponible en temps réel sans lecture fournisseur qualifiée. Les limites de la copie locale et de sa dernière synchronisation sont explicites ; la confirmation locale ne promet aucun événement distant créé.

## Parcours

La fiche Client permet de choisir le membre et le début, de visualiser la fin calculée, de confirmer, replanifier ou annuler. Recherche et pagination doivent couvrir tous les membres admissibles et conserver la saisie après refus. Le calendrier CRM affiche le rendez-vous réservé et le portail montre son horaire confirmé, distinct de la préférence initiale.

Le lecteur du calendrier reste filtré par société et périmètre autorisé. La démo publique ne permet aucune mutation. Les rendez-vous ne déclenchent aucun e-mail ni appel fournisseur sans commande explicitement prévue.

## Preuves requises

Les suites doivent vérifier accès, versions, fuseaux et changement d’heure, durée invalide, ressource suspendue, deux réservations concurrentes, conflit terrain dans les deux sens, annulation/replanification et échec transactionnel. Une recette navigateur doit parcourir demande, confirmation, calendrier, consultation publique du résultat et annulation. SQLite ne remplace pas la qualification concurrente PostgreSQL.

Ce document fixe le comportement à réaliser ; il ne certifie pas sa présence actuelle. L’action historique de confirmation se limite encore au statut et à la réponse de la demande.
