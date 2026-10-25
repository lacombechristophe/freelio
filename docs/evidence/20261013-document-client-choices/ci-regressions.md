# Validation sans client et hydratation

Les recettes `38437339358` et `38437344551` du candidat `c5d1191` n'ont pas qualifié le navigateur. Sur la branche, les 400 cas atteignent 378 réussites, 19 exclusions historiques et trois échecs ; le job atteint ensuite sa limite de 35 minutes pendant la conservation des preuves. PostgreSQL et l'image Linux réussissent.

Deux échecs proviennent du bouton Enregistrer désactivé sans client. Le parcours existant doit pouvoir déclencher l'erreur de validation et conserver la saisie. Le blocage reste appliqué lorsqu'un client choisi est encore en cours de vérification ou devenu inaccessible ; l'absence de choix déclenche à nouveau la validation existante, sans écriture.

Le troisième échec de la branche concerne le contrat mobile ; la PR reproduit la même recherche perdue sur Facture ordinateur avant d'atteindre sa limite de durée. La trace du contrat place la saisie juste après la navigation, avant l'hydratation, puis retrouve le champ vide et les 1 001 résultats initiaux. Le parcours de création attend désormais le signal d'hydratation déjà utilisé par la recette existante avant la saisie. Les huit parcours gardent leurs assertions de recherche, conservation des champs, rattachement SQL et refus d'un client supprimé.

Aucune exclusion ajoutée, aucune assertion retirée, aucun délai de test augmenté. Ces corrections doivent être confirmées par une nouvelle recette complète du candidat publié.
