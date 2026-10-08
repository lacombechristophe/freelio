# Banque : historique et correspondances complets — proposition

8 octobre 2026. Sous-lot BANK-01 / L8, distinct des droits Finance déjà corrigés. Proposition visible à confirmer avant implémentation.

## Constat de lecture

`getBankingDashboard` charge les 250 dernières transactions et les 100 dernières dépenses non rapprochées. Le tableau n’a ni recherche ni pagination ; ses cartes additionnent seulement ces transactions. Les factures candidates sont chargées sans plafond. Le sélecteur d’une sortie bancaire filtre les seules dépenses de la tranche initiale. Ces limites sont explicites dans le code ; aucune perte de données ou incident bancaire réel n’est revendiqué observé.

## Lot proposé

- Recherche sur libellé/référence et filtre « Toutes / À rapprocher / Rapprochées » sur l’historique autorisé, avec total et pages de 25, près du tableau existant.
- Cartes « Entrées importées », « Sorties importées » et « À rapprocher » calculées sur tout l’historique accessible, indépendamment de la page ou de la recherche. Aucun changement de libellé, couleur ou disposition générale.
- Recherche et pages de 25 des correspondances factures/dépenses près du sélecteur existant. Les dépenses restent limitées au montant exact et non rapprochées ; les factures doivent être émises, non réglées et compatibles avec le montant bancaire. Le choix reste identifié même hors page ; les règles sont relues à la mutation.
- Préserver le CSV et son mapping pendant la navigation. Les boutons d’import, rapprochement et création de dépense gardent leur apparence et sont désactivés en démo publique, conformément à la règle déjà approuvée.

Le lot ne connecte aucun établissement bancaire et ne transmet rien à un fournisseur. Il ne modifie ni archive de facture ni historique de paiement.

## Contrat serveur et recette

Lecteurs sous `finance.read`, tenant/agence et membership actuels ; mutations sous `finance.write`. Sélection indépendante des filtres/pages, validation bornée, ordre stable et count/page cohérents. Pas d’identifiant étranger ou de métadonnée privée dans la réponse. Échec de lecture explicite, sans présenter une ancienne page comme résultat d’un nouveau filtre.

Fixtures isolées : au moins 251 transactions, 101 dépenses et 26 factures ; recherche de la plus ancienne, dernière page, totaux complets, filtre avant count, correspondance hors première tranche et choix conservé. SQL avec vraies actions/droits, révocation, société étrangère et démo publique. E2E ordinateur/mobile pour recherche, pagination et conservation du mapping CSV. Les recettes restent sans identifiant ni donnée réelle.

Les risques de concurrence sont traités séparément. Une recette SQLite sur f5573b0, avec vraies actions/SQL et une porte contrôlée après les deux lectures de déduplication, reproduit un import réussi et un refus P2002 pour deux imports identiques simultanés. L’index unique conserve une seule ligne : ce test ne démontre pas un mouvement doublé. L’instrumentation retarde les vraies lectures, sans simuler leurs réponses ni les écritures. Le test et ses fixtures sont restés dans la recette externe puis ont été retirés de sa suite ; aucun correctif n’est annoncé appliqué. PostgreSQL, rapprochement concurrent et dépense orpheline restent à reproduire ; le lot de pagination ne prétend pas les résoudre.
