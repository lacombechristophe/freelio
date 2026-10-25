# Facturation des temps par Comptabilité

Un cas SQL sur un chantier accessible avec agence assignée reproduit le refus `FORBIDDEN:operations.write` pendant le rattachement des temps à leur facture. Facture, lignes et audit sont annulés par la transaction ; le temps reste disponible. Le rôle Comptabilité dispose de Finance en écriture et le formulaire de facturation est présent. Le [diagnostic](evidence/20261012-time-billing-preflight/before.json) conserve aussi cinq snapshots périmés et un témoin Owner.

## Lot approuvé le 12 octobre 2026

Autoriser uniquement le rattachement `invoiceId` dans l'action Finance qui crée un brouillon depuis des temps accessibles, avec recontrôle de société, client, chantier et agence. La facture cible doit être celle créée dans cette transaction. Aucun droit général Opérations n'est accordé : création, durée, description, date, facturabilité et suppression du temps restent soumis à Opérations en écriture. Une régression vérifiera ce refus pour les autres champs et contextes.

Le formulaire, les boutons, couleurs et emplacements sont conservés ; la facturation réussit pour Comptabilité sur le périmètre cohérent. Pas d'émission, paiement, PDF ou envoi fournisseur. Ce lot complète la correction proposée des snapshots, sans l'implémenter avant accord.
