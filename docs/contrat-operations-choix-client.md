# Choix Client du Centre des opérations

## Constat reproductible

Le diagnostic SQL isolé contient 501 clients et 501 produits actifs cohérents, ainsi que des références d'une autre société. getOperationsDashboard conserve correctement la société, mais ne renvoie pas le 501e client ni le 501e produit. Résultat : un cas de périmètre réussi et deux cas de complétude échoués. Les formulaires utilisent directement ces listes.

## Lot approuvé

Compléter seulement le choix Client des créations Site, Ticket SAV, Contrat d'entretien et Commande client : recherche sur tous les clients autorisés, total, pages de 25 et précédent/suivant, choix conservé hors page. Conserver les autres saisies lors d'une recherche, d'un changement de page, d'une erreur ou d'une actualisation. Refuser l'enregistrement tant qu'un client choisi n'est pas vérifié et permettre de remplacer un choix disparu. Garder le style existant, les couleurs et les autres champs/boutons.

Les choix Produit, Site, Équipement, Chantier, Commande et Dépôt ne font pas partie de ce lot. Les cartes de stock et autres listes ne sont pas qualifiées par ce diagnostic. Aucun envoi, raccordement fournisseur, installation ou mutation de production.

Accord utilisateur : « Oui, compléter ces quatre choix Client » (13 octobre 2026).

## Vérification prévue

Lecteur authentifié avec filtre société, validation stricte des paramètres, pagination stable et sélection résolue séparément. Réutiliser le lecteur et le composant existants si leur contrat de droits convient, sans élargir les autorisations.

SQL : dernier client au-delà de 500, recherche, pages complètes sans doublons, sélection hors page, disparition et référence étrangère, refus avant écriture. Navigateur compilé : les quatre formulaires sur ordinateur/mobile, conservation des champs après recherche et panne, remplacement du client supprimé, validations existantes et démo en lecture seule. Les preuves restent distinctes des autres limites identifiées.
