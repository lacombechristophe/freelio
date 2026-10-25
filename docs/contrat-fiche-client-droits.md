# Fiche Client : droits et relations imbriquées

Une recette SQL isolée reproduit quatre échecs sur le candidat 41238b0 : la fiche retourne un projet d’une autre société lié par erreur au client ; elle retourne les projets des agences non attribuées ; les rôles Technicien et SAV reçoivent devis, contrats et factures sans les droits des lecteurs commerciaux. Les refus de client étranger et de membership suspendu passent. La session est simulée ; DAL, memberships, relations et lectures SQL sont réels.

## Correction approuvée

Conserver la matrice actuelle. La lecture CRM relit membership et droits, filtre chaque collection par société, puis projets/devis/factures par agence et société du projet lié. Les contrats restent partagés dans la société selon leur droit Sales actuel. Les agrégats financiers suivent le même périmètre que les factures. Une relation historique incohérente ne doit pas élargir une lecture.

Sans sales.read, ne retourner aucun devis ou contrat ; sans finance.read, ne retourner aucune facture ni montant financier, y compris les compteurs mis en cache sur Client. La fiche reste consultable avec crm.read. Un montant non autorisé est indisponible, jamais présenté comme zéro.

## Effet visible approuvé

Dans les cartes existantes, remplacer les listes non autorisées par « Accès commercial requis » ou « Accès Finance requis », et afficher « Accès Finance requis » pour CA/impayé. Masquer « Créer un devis » sans sales.write. Conserver les cartes, colonnes, couleurs, onglets et dispositions. Les lectures autorisées gardent leur présentation.

## Qualification

Retrouver les résultats permis, exclure autre société/agence même depuis une relation imbriquée, conserver les droits Owner/Admin et les rôles Finance/Sales/Viewer, refuser révocation/suspension, vérifier démo et agrégats. Parcours ordinateur/mobile avec utilisateur restreint et propriétaire, sans transport fournisseur ni mutation métier. La pagination des historiques Client, ses autres collections et les droits de ses commandes restent des lots distincts.

Statut : accord reçu le 8 octobre 2026 ; correction implémentée et qualification en cours. La même suite étendue reproduit douze échecs sur dix-sept avec le lecteur précédent, puis dix-sept réussites avec le correctif. Voir la [qualification et ses limites](qualification-fiche-client-droits-20261008.md).
