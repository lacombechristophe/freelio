# Rattachement des temps par Comptabilité

Le [diagnostic antérieur](../20261012-time-billing-preflight/README.md) reproduit le refus d'Opérations pendant une création Finance. Le [lot approuvé](../../contrat-facturation-temps-comptabilite.md) autorise la seule colonne `invoiceId` via un contexte limité au brouillon créé dans la transaction. Le contexte est quitté avant l'audit. Les temps ne peuvent ni être détachés, ni être modifiés, ni viser une autre facture par cette autorisation.

La facture cible doit être accessible après sa création ; le rattachement recontrôle société, client, chantier et agence. Une sélection de plusieurs chantiers dont la facture sans chantier serait inaccessible à Comptabilité est annulée. Ce lot ne résout pas les durées, textes, TVA ou préfixes périmés ; leur correction reste distincte.

Les [résultats locaux](local.json) comptent 1 915 tests réussis dans 201 fichiers, avec couverture des six fichiers critiques inchangée. Les 30 cas SQL du lot vérifient huit rôles, références étrangères et changements après préparation, retrait d'agence, rollback du rattachement et de l'audit, contexte restauré, mutations directes et démo en lecture seule. Session et cache sont simulés ; la base, les transactions et contraintes sont réelles. Le proxy injecte les pannes sans remplacer les données.

Deux E2E sont définis et chargés, sur ordinateur/mobile. Ils créent le brouillon depuis le formulaire compilé, puis contrôlent le lien, les valeurs du temps, la facture et son audit dans la base fictive gardée. Leur chargement local ne vaut pas exécution : les deux CI doivent qualifier ce code sur le commit publié. Aucun serveur local ni envoi fournisseur n'est lancé.
