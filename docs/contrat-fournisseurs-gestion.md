# Fournisseurs : annuaire, édition et désactivation — lot approuvé

Sous-lot CRM-01 / L8. Avant ce lot, l’interface créait un fournisseur avec nom, code, contact et e-mail ; les actions ne proposaient ni édition ni changement d’activité. Les sélecteurs d’Opérations ne chargeaient que 200 fournisseurs actifs. La fiche existe, avec des historiques plafonnés. La protection des lectures liées par agence est un correctif serveur distinct, qualifié séparément (884 tests locaux).

## Lot visible approuvé

- Dans l’en-tête d’Opérations, ajouter « Fournisseurs » ouvrant un annuaire. Recherche nom/code/contact, filtre « Tous / Actifs / Inactifs », total et pages de 25, puis lien vers la fiche existante.
- Sur la fiche, ajouter « Modifier » et « Désactiver / Réactiver ». Le formulaire propose nom, code, contact, e-mail, téléphone, adresse, conditions de paiement et délai de livraison en jours, avec « Enregistrer / Annuler ».
- Ajouter les quatre champs absents au formulaire de création existant : téléphone, adresse, conditions de paiement et délai de livraison.
- Dans les sélecteurs Fournisseur de création d’achat et de produit, ajouter recherche et pagination par 25 avec choix conservé. Un fournisseur désactivé reste dans ses rattachements existants, mais n’est plus proposé ni accepté pour un nouveau rattachement. La réactivation le rend à nouveau sélectionnable.

Couleurs et composants actuels conservés ; pas de déplacement des commandes existantes. Les nouvelles mutations sont désactivées en démo publique. La désactivation demande confirmation et conserve produits, commandes, retours et prix. Aucune suppression définitive, import ou sortie fournisseur n’est ajouté.

## Contrat serveur

Annuaire partagé à la société sous `operations.read`, édition/activité sous `operations.write`, avec membership actuel, bornes de validation et sélection relue. Les prix, stocks, commandes et retours gardent leurs droits actuels ; un fournisseur partagé n’ouvre aucun accès d’agence.

Le formulaire transporte `updatedAt` : une édition concurrente refuse l’écrasement, conserve la saisie et demande de recharger. Nom/code uniques sont vérifiés par les contraintes SQL ; les champs optionnels vides deviennent null. L’adresse et les conditions sont bornées. Un champ modifié est audité sans exposer de donnée privée dans les erreurs.

Les mutations qui créent un rattachement relisent l’activité. Une édition de produit déjà rattaché à un fournisseur inactif peut conserver ce même identifiant ; elle ne permet pas d’y rattacher un autre produit. Un changement concurrent d’activité ou de coordonnées doit conserver une trace et empêcher les écrasements silencieux. La désactivation n’annule aucune commande existante.

## Recette

Au moins 201 fournisseurs fictifs, recherche de l’ancien et pagination finale ; choix hors page, fournisseur étranger, permissions/révocation et démo publique. Vraies actions/SQL pour édition, conflit de révision, doublon de nom/code, désactivation/réactivation, nouveau rattachement refusé et ancien produit encore modifiable. E2E ordinateur/mobile pour annuaire, modification, désactivation et sélecteur. Les historiques plafonnés de la fiche, autres référentiels et concurrence financière restent des sous-lots séparés.

Implémentation et recette locale décrites dans la [qualification](qualification-banque-fournisseurs-20261008.md). La branche 1e5e3bc et sa PR exécutent désormais ces nouveaux parcours avec succès dans les deux formats ; voir les références datées de qualification.
