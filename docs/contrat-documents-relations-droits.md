# Références imbriquées des documents

## Régression sur 13a89e7

Une SQLite isolée et fictive appelle les vrais lecteurs Devis, Factures et Contrats, avec session et cache Next simulés. Dix-sept assertions donnent treize échecs et quatre réussites, sans erreur de hook. Les relations incohérentes sont créées par la fixture ; leur création par les mutations de l’application n’est pas démontrée.

Les treize échecs concernent le chantier, la commande client et le contrat généré d’un devis ; les achats d’un chantier et factures d’une commande ; le chantier, la facture source et les avoirs d’une facture ; le contrat source, les avenants et l’entretien d’un contrat. Onze assertions portent sur une référence d’une autre société ; deux portent sur les factures et le statut de facturation d’une commande retournés à Sales sans `finance.read`.

Les quatre contrôles positifs conservent le chantier cohérent du devis, le montant et le client de la facture, le contenu et les coordonnées du contrat, puis refusent le contrat étranger lorsqu’il est demandé directement. Protéger uniquement le document racine ne borne donc pas ses relations imbriquées.

## Lot approuvé le 9 octobre 2026

Filtrer ces références côté SQL selon société, cohérence de leur client et agences accessibles. Conserver la politique actuelle des contrats commerciaux, qui n’est pas restreinte par agence ; appliquer le périmètre d’agence aux chantiers, commandes, achats, factures et entretiens. Les listes ne retournent aucun document étranger ou inaccessible.

Dans la carte « Suite du dossier » d’un devis, remplacer le statut de facturation de la commande et la synthèse des factures par « Accès Finance requis » sans `finance.read`. Ne pas utiliser les données cachées pour calculer l’état prêt/à faire ou son compteur.

Une référence singulière enregistrée mais inaccessible affichera « Référence liée indisponible » à sa place : chantier, commande ou contrat généré du devis ; facture source d’un avoir ; contrat source ou entretien d’un contrat. Aucun identifiant, numéro, intitulé ou lien de la référence interdite ne sera transmis. Ne pas présenter cette situation comme une absence permettant de recréer une commande ou un contrat ; les commandes correspondantes seront indisponibles jusqu’à correction de la référence.

Conserver les documents racines accessibles, leurs lignes, montants autorisés, coordonnées, contenu, signatures et archives immuables. Cartes, couleurs, disposition et parcours cohérents restent conservés. Aucun envoi, suppression, modification d’archive ou changement de matrice des droits n’est ajouté.

## Qualification

Conserver la baseline et son reproducer, puis étendre les tests SQL à Owner/Admin, Sales sans Finance, Finance autorisé, sociétés étrangères, agences révoquées et relations locales cohérentes. Vérifier aussi l’absence de calcul sur les données masquées et la distinction entre référence absente et inaccessible. Qualifier types/lints, SQLite/PostgreSQL et rendu ordinateur/mobile sur le candidat corrigé. La CI Contacts de 13a89e7 ne qualifie pas ce lot proposé.

Le correctif `ae88e47` passe désormais les 33 régressions SQL et les six E2E dans ses deux CI. Les [résultats et limites](evidence/20261009-document-relations/README.md) conservent la baseline et les références testées.
