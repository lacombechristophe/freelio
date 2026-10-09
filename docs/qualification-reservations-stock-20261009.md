# Réservations de stock concurrentes

Les actions de réservation possèdent déjà une transaction, une mise à jour conditionnelle de l'inventaire et une prise conditionnelle de la réservation pour sa libération ou sa consommation. Cette recette vérifie leur résultat persistant ; elle ne modifie aucun comportement métier ni interface.

## Invariants

Douze cas SQL vérifient deux réservations de cinq, six ou dix unités sur un stock de dix ; deux libérations, deux consommations et une libération face à une consommation ; la remise à disposition après libération ; le refus d'une quantité excessive ; le refus de retraiter une réservation ; l'agence révoquée, le rôle Viewer et la démo publique.

La quantité réservée doit égaler la somme des réservations actives. La quantité physique doit égaler le stock initial moins les réservations consommées. Chaque réservation persistée possède exactement un mouvement RESERVE, puis au plus un mouvement RELEASE ou CONSUME correspondant à son état. Les écritures refusées ne doivent laisser aucune réservation ni mouvement orphelin. Au moins une commande concurrente est acceptée, et une seule peut terminer la même réservation.

Les refus concurrents doivent être les erreurs métier de stock modifié, quantité incompatible ou réservation déjà traitée/introuvable. Une erreur SQL arbitraire ne suffit pas à réussir le test. La recette ne promet pas l'acceptation de toutes les commandes concurrentes.

## Instrumentation et reproduction

Session et cache Next sont simulés. Les actions, droits, DAL, lectures, transactions et contraintes SQL sont réels. Sur PostgreSQL, un proxy attend deux résultats de lecture identiques avant de les libérer : inventaire dans la transaction de réservation, ou réservation active avant les opérations terminales. Les assertions exigent ces deux lectures initiales. Une échéance de sécurité libère la barrière ; elle ne permet pas de réussir sans les deux observations.

Sur SQLite, cette barrière est inactive pour respecter sa connexion transactionnelle unique. Les appels sont lancés simultanément et les mêmes invariants de persistance sont vérifiés. Cela ne prouve pas une course entre plusieurs processus SQLite.

Dans une copie isolée, avec le lockfile, Prisma généré, une base neuve et des clés fictives :

```sh
npm run test:unit -- tests/unit/stock-reservation-concurrency.integration.test.ts
```

Les douze cas passent localement en SQLite. Une première exécution avait onze réussites et une assertion incorrecte du test : `toBe` comparait l'objet matcher à la chaîne de statut. `toEqual` vérifie maintenant le statut attendu ; aucun code métier, délai ou condition d'acceptation n'a changé.

La qualification de la barrière PostgreSQL reste requise dans la CI du candidat. La [facturation précédente](evidence/20261009-invoice-actions/README.md) conserve ses propres preuves ; ses CI ne qualifient pas ce nouveau fichier.

## Limites

Cette recette couvre la concurrence sur un inventaire et une réservation. Achats/réceptions/retours, annulation chantier, forte contention, stocks multiples, panne de processus et cohérence de tous les rattachements nécessitent des preuves distinctes. Les fixtures ne certifient pas une exploitation hébergée.
