# Banque : historique et correspondances complets

8 octobre 2026. Sous-lot BANK-01 / L8, distinct des droits Finance déjà corrigés. Lot visible approuvé et implémenté ; qualification navigateur du candidat à venir.

## Constat de lecture

`getBankingDashboard` charge les 250 dernières transactions et les 100 dernières dépenses non rapprochées. Le tableau n’a ni recherche ni pagination ; ses cartes additionnent seulement ces transactions. Les factures candidates sont chargées sans plafond. Le sélecteur d’une sortie bancaire filtre les seules dépenses de la tranche initiale. Ces limites sont explicites dans le code ; aucune perte de données ou incident bancaire réel n’est revendiqué observé.

## Lot approuvé

- Recherche sur libellé/référence et filtre « Toutes / À rapprocher / Rapprochées » sur l’historique autorisé, avec total et pages de 25, près du tableau existant.
- Cartes « Entrées importées », « Sorties importées » et « À rapprocher » calculées sur tout l’historique accessible, indépendamment de la page ou de la recherche. Aucun changement de libellé, couleur ou disposition générale.
- Recherche et pages de 25 des correspondances factures/dépenses près du sélecteur existant. Les dépenses restent limitées au montant exact et non rapprochées ; les factures doivent être émises, non réglées et compatibles avec le montant bancaire. Le choix reste identifié même hors page ; les règles sont relues à la mutation.
- Préserver le CSV et son mapping pendant la navigation. Les boutons d’import, rapprochement et création de dépense gardent leur apparence et sont désactivés en démo publique, conformément à la règle déjà approuvée.

Le lot ne connecte aucun établissement bancaire et ne transmet rien à un fournisseur. Il ne modifie ni archive de facture ni historique de paiement.

## Contrat serveur et recette

Lecteurs sous `finance.read`, tenant/agence et membership actuels ; mutations sous `finance.write`. Sélection indépendante des filtres/pages, validation bornée, ordre stable et count/page cohérents. Pas d’identifiant étranger ou de métadonnée privée dans la réponse. Échec de lecture explicite, sans présenter une ancienne page comme résultat d’un nouveau filtre.

Fixtures isolées : au moins 251 transactions, 101 dépenses et 26 factures ; recherche de la plus ancienne, dernière page, totaux complets, filtre avant count, correspondance hors première tranche et choix conservé. SQL avec vraies actions/droits, révocation, société étrangère et démo publique. E2E ordinateur/mobile pour recherche, pagination et conservation du mapping CSV. Les recettes restent sans identifiant ni donnée réelle.

Les risques de concurrence sont traités séparément. Une recette SQLite sur f5573b0, avec vraies actions/SQL et une porte contrôlée après les deux lectures de déduplication, reproduit un import réussi et un refus P2002 pour deux imports identiques simultanés. L’index unique conserve une seule ligne : ce test ne démontre pas un mouvement doublé. L’instrumentation retarde les vraies lectures, sans simuler leurs réponses ni les écritures. Le test et ses fixtures sont restés dans la recette externe puis ont été retirés de sa suite ; aucun correctif n’est annoncé appliqué. PostgreSQL, rapprochement concurrent et dépense orpheline restent à reproduire ; le lot de pagination ne prétend pas les résoudre.

## Lecture des factures

Le reste à payer compare deux colonnes et le montant bancaire. Prisma ne sait pas exprimer cette soustraction dans son filtre portable. Le lecteur parcourt donc des projections de 200 factures, sous la même transaction Serializable, et ne garde que la page demandée et la dernière page. Il calcule le total après éligibilité. Le choix sélectionné est relu indépendamment de la recherche. Les requêtes passent toutes par le client qui applique les droits de société/agence ; le garde contre le SQL brut en démo publique reste intact.

Ce choix évite une réponse ou une accumulation mémoire proportionnelle au portefeuille, mais sa durée reste proportionnelle au nombre de factures candidates. La transaction est bornée à 20 secondes : au-delà, la lecture échoue explicitement. Cette limite devra être mesurée sur un portefeuille hébergé représentatif ; aucune promesse de latence à grande échelle n’est faite. Les libellés des mouvements déjà rapprochés sont relus par les modèles Facture/Dépense protégés, sans exposer le document d’une agence retirée.

## Vérifications locales

`banking-lists.integration.test.ts` : 18 cas SQL réels, dont les anciens plafonds, une frontière de lecture à 201 factures, le filtre avant décompte, une sélection hors recherche, une agence révoquée et la démo publique. Les 25 tests de permissions bancaires existants passent aussi. Suite commune avant l’ajout du cas de frontière : 833 tests / 152 fichiers, types/lint/build réussis ; le nouveau cas passe séparément. Les parcours `banking-history.spec.ts` couvrent ordinateur/mobile, factures et dépenses, choix conservé, CSV et erreur de date corrigée. Leur découverte locale n’est pas présentée comme une exécution navigateur.
