# Choix Client des créations Opérations

Le diagnostic initial utilise la vraie action et une SQLite isolée : avec 501 clients et 501 produits actifs cohérents, les derniers éléments ne sont pas proposés. Le périmètre société reste correct. Le rapport conserve les deux échecs et le cas de périmètre réussi ; le code de reproduction est fourni.

Le lot approuvé complète seulement les choix Client de Site, Ticket SAV, Contrat d'entretien et Commande client. Il réutilise getClientChoices (société, DTO id/nom, pages de 25, sélection séparée) et useClientChoices, en conservant le select natif. Le payload Client borné, désormais sans consommateur, est retiré du tableau de bord. Les droits des quatre actions ne changent pas.

## Vérifications locales

- 28 nouveaux cas SQL réussis : 501 clients sur 21 pages, sélection hors page, recherche, huit rôles, quatre créations avec leurs champs, refus étranger/rôle/démo avant écriture, disparition et adhésion révoquée.
- 77 cas ciblés réussis au total : les 24 choix Client Documents, 16 contrôles Finance des commandes et neuf périmètres Fournisseur restent exécutés.
- Types, ESLint, Oxlint, syntaxe du seed et diff vérifiés.
- Huit fixtures indépendantes (quatre formulaires, deux surfaces), chacune avec 501 clients, authentification réelle vérifiée, client final et site cohérents. Le contrôle supprime uniquement ces fixtures et constate zéro société résiduelle.

Les tests SQL simulent la session Auth.js et le cache Next ; permissions, adhésions, Prisma, actions et contraintes restent réels. Aucun envoi fournisseur ni document financier n'est émis.

## Parcours compilés définis

operations-client-choices.spec.ts définit huit cas, sur ordinateur/mobile : recherche du dernier client, changement de page, sélection hors page, panne HTTP et reprise, suppression du client choisi puis remplacement, conservation des champs et création métier réelle dans la SQLite fictive. Les mutations publiques sont refusées séparément dans les tests SQL. La consultation hébergée ne prouve pas ces créations.

Ces huit cas ne sont pas encore exécutés à la date de ce rapport local. La CI du nouveau commit et sa propre recette hébergée doivent les qualifier ; les résultats du commit Prospects précédent ne qualifient pas ce lot.

## Limites conservées

Le choix Produit reste limité à 500 dans le tableau de bord, y compris pour le stock ; ce défaut est reproduit mais n'est pas corrigé par ce lot Client. Les autres choix bornés (sites, équipements, chantiers, commandes et dépôts) et les indicateurs doivent être qualifiés séparément. Il n'y a ni nouvelle preuve de consentement ni qualification d'un fournisseur réel, d'un stockage persistant, de la charge ou de la reprise après arrêt brutal.
