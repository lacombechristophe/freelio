# Facturation : refuser les temps modifiés pendant la préparation

Le diagnostic appelle une vraie édition de 3 600 à 7 200 secondes après la lecture de préparation et avant la transaction de facturation. Une facture de 10 000 centimes pour une heure est néanmoins créée et liée au temps de deux heures. Il s'agit d'un entrelacement contrôlé de deux vraies actions, pas d'un test de charge multi-processus.

## Lot proposé

- Recontrôler les références, durée, date, description, facturabilité et absence de facture de chaque temps dans la transaction avant toute création/association définitive. Vérifier aussi les paramètres de TVA et de numérotation utilisés pendant la préparation.
- Refuser un calcul périmé avec « Les temps ont changé pendant la création de la facture. Rechargez la page puis réessayez. », en annulant facture, lignes, association et audit. La modification légitime du temps reste conservée ; un nouvel essai après actualisation utilise les valeurs courantes.
- Renvoyer ce refus de façon contrôlée au navigateur compilé et conserver les sélections, taux, objet et échéance dans le formulaire actuel. Les erreurs techniques restent privées.
- Aucun champ, bouton, couleur ou disposition supplémentaire ; aucun PDF émis, envoi fournisseur ou remboursement.

La facturation reste manuelle et soumise à Finance en écriture. Un temps déjà facturé reste protégé par le lot Temps. Les plafonds et sélecteurs de Temps non facturés, les durées historiques invalides et les cas comptables complexes restent des lots séparés.
