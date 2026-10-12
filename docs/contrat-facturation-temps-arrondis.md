# Montants des factures issues des temps

Le diagnostic SQL élargi utilise deux entrées d'une minute à 100 € HT/heure. L'aperçu affiche 3,33 € ; le brouillon actuel facture 3,00 € en regroupement ou 4,00 € en détail. La durée en heures est arrondie à deux décimales avant le calcul monétaire. Les deux variantes et leur témoin sont conservés dans `evidence/20261012-time-billing-preflight/expanded-before.json`.

## Lots approuvés les 12 et 13 octobre 2026

Utiliser la durée exacte en secondes pour construire les quantités, puis le calcul commercial existant qui arrondit chaque ligne au centime. L'aperçu doit employer les mêmes lignes que la création, selon le mode choisi. Dans l'exemple : 3,33 € en regroupement, 3,34 € en détail (deux lignes de 1,67 €). Cette différence d'arrondi par ligne doit être explicite dans le formulaire actuel.

Conserver taux, sélection, échéance, modes, champs, boutons, couleurs et disposition. Les factures existantes et leurs archives ne seront pas recalculées. Pas d'émission ni d'envoi. Le complément approuvé affiche jusqu'à six décimales dans les PDF des brouillons de facture ; les devis et archives existantes restent inchangés. Un taux ou total hors capacité de calcul affiche « Montant indisponible » et désactive la création, en conservant la saisie. Le [complément d'émission](contrat-precision-nouvelles-archives-factures.md), approuvé séparément, conserve cette précision dans les nouvelles archives. Les durées historiques invalides et plafonds de sélection restent hors de ce lot.
