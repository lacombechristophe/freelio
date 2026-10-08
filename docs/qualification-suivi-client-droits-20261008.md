# Suivi client et droits Finance, 8 octobre 2026

Le [lot approuvé](contrat-suivi-client-droits.md) remplace les montants indisponibles par « Accès Finance requis ». Le lecteur n’interroge pas les factures sans lecture Finance et calcule scores, filtres, ordre et compteurs sur les mesures accessibles. Facteurs et règles financières sont exclus de cette projection, ainsi que l’activité issue des factures. Les relevés globaux ne servent de tendance qu’avec lecture Finance et périmètre de société complet ; une projection d’agence ne prétend pas avoir un historique local.

Les sauvegardes sans montant conservent la valeur existante. L’écriture du montant et des règles financières exige Service et Finance en écriture ; les règles recommandées opérationnelles restent installables sans reconfigurer une règle financière existante. Une exception DAL limitée aux six champs de suivi non financiers corrige le refus `FORBIDDEN:crm.write` qui empêchait les profils Technicien/SAV de sauvegarder. La matrice des rôles et l’interdiction d’écriture en démo publique sont conservées.

## Preuve SQL

La recette initiale reproduit quatre divulgations de montant parmi cinq cas. La [suite étendue](evidence/20261008-customer-success-permissions/comparison.json) emploie ensuite le même fichier de 26 cas : 21 échecs avec les trois lecteurs/contrôles historiques substitués, puis 26 réussites après correction. Les échecs étendus comprennent accès, calculs, sauvegardes et règles ; ils ne sont pas tous présentés comme des divulgations de montant.

Les cas emploient les vraies adhésions, agences, actions, DAL et transactions. Ils couvrent Owner, Viewer, Technicien/SAV, montant préservé, facteurs et statuts masqués, activité des factures, règles par défaut, écritures autorisées/refusées, agence retirée/désactivée, sociétés et projets étrangers, suspension et démo. Les spies de facture laissent exécuter les méthodes originales ; ils ne fabriquent aucune donnée SQL. Le [correctif du contexte d’autorisation](qualification-contexte-auth-20261008.md) possède une régression séparée de sept cas.

```sh
npm run test:unit -- tests/unit/customer-success-permissions.integration.test.ts
```

Employer une recette isolée avec base neuve et clés fictives. Huit parcours navigateur sont préparés pour les quatre rôles sur ordinateur/mobile, dans deux sociétés séparées ; leurs lectures SQL vérifient que la sauvegarde à l’écran conserve réellement le montant de renouvellement. La suite commune passe 1 020 tests / 163 fichiers en 232,07 secondes, types, ESLint et Oxlint. Build, PostgreSQL et navigateur du nouveau candidat restent à qualifier.

Le build de 75 pages réussit (compilation 36,5 secondes, types 20,6 secondes). Les schémas SQLite/PostgreSQL sont validés sans connexion ; 196 E2E / 42 fichiers sont découverts. Leur exécution reste à obtenir dans les deux CI du nouveau candidat.

## Limites

Cette correction porte sur Suivi client. Elle ne qualifie pas les scores partagés des autres annuaires, les analyses Service, tous les champs libres ou relations de maintenance, ni toute l’isolation CRM. Le portefeuille complet garde son calcul par lots avant tri et pagination ; une charge hébergée reste à mesurer. Aucun fournisseur réel, envoi ou donnée métier existante n’est utilisé. Les CI vertes de 653cddc qualifient les lots précédents, pas ces nouveaux changements.
