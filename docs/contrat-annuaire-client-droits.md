# Annuaire Client : montants et droits Finance

Le correctif de fiche Client ne couvre pas ses annuaires. Une recette SQL séparée vérifie `getClients` et `getClientDirectory` avec Owner/Comptabilité puis Technicien/SAV/Commercial : six échecs et deux réussites sur 3be747d. Les lecteurs CRM retournent encore les agrégats de factures aux trois rôles sans `finance.read`. Les affectations d’agence du DAL sont présentes ; elles ne remplacent pas la permission de lecture Finance. [Résultats et reproduction](evidence/20261008-client-directory/README.md).

## Correction approuvée

Conserver l’annuaire accessible avec `crm.read`, mais ne pas lire ni retourner ses montants sans `finance.read`. Retourner `null` pour CA et impayé, y compris les valeurs mises en cache. Avec Finance, agréger seulement la société et les projets permis, en excluant les relations incohérentes. Les deux lecteurs et l’export paginé suivent le même contrat.

Dans les cellules CA/Impayé et dans l’export CSV, afficher « Accès Finance requis » sans cette permission. Conserver colonnes, commandes, pagination, styles et couleurs. Les tris/filtres restent disponibles : ils opèrent sur la valeur indisponible `null`, jamais sur un montant caché. Un tri de ces valeurs est stable par identifiant ; les filtres « renseigné / non renseigné » reflètent leur indisponibilité, et les comparaisons numériques ne retournent aucun résultat. Les valeurs permises gardent leur format actuel.

## Vérifications

Lectures SQL réelles, session simulée : autorisé/refusé, montant périmé, autres sociétés/agences, relation incohérente, révocation et entrée de filtre/tri sans oracle financier. Vérifier CSV et cellules sur ordinateur/mobile, avec des utilisateurs fictifs isolés. La charge des tris calculés et le portefeuille Suivi client restent distincts.

Statut : accord reçu le 8 octobre 2026 ; implémentation en qualification. Le premier reproducer de huit cas reste une pièce historique : six échecs sur 3be747d. La suite étendue de trente cas reproduit vingt échecs sur les mêmes lecteurs précédents, puis passe avec le correctif. Voir la [qualification](qualification-annuaire-client-droits-20261008.md).
