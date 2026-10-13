# Choix Produit des opérations

Le [diagnostic initial](../20261013-operations-client-choices/before.json), exécuté sur ffee948, montre un 501e produit actif absent du payload utilisé par les formulaires. Le contrôle de société passe. Le reproducteur est conservé dans le même dossier. Le candidat Client d36a38d conserve encore ce chargement Produit borné ; le présent lot détache les six choix approuvés de ce payload.

getOperationsProductChoices retourne seulement id, référence et libellé : société courante, actifs, suivi du stock lorsque le formulaire le demandait déjà, recherche, ordre label/id, pages de 25 et sélection résolue séparément dans un snapshot Serializable. Aucun prix, inventaire ou fournisseur n'est transmis par ce lecteur. Les six actions et leurs permissions sont conservées.

Les créations Équipement, Mouvement, Transfert, Commande et Réservation et le formulaire Matériel utilisé gardent leurs selects natifs. Recherche, page, quantités, prix et rattachements ne réinitialisent pas la saisie. Une recherche échouée ou un choix disparu bloque la sauvegarde ; les résultats encore éligibles permettent un remplacement. Les réponses de recherche obsolètes sont ignorées. Les validations HTML des champs requis restent actives.

## Preuves locales

- 46 nouveaux cas SQL réussis : 501 produits, recherche référence/libellé, pagination et égalités, choix séparé, actifs/non suivis, huit rôles, paramètres invalides, six mutations cohérentes, refus étranger/Lecteur/démo sans mutation ni audit, disparition et adhésion révoquée.
- 74 cas ciblés réussis en incluant les 28 choix Client Opérations. Session Auth.js et cache Next simulés ; permissions, Prisma, transactions et actions restent réels. Les stocks sont fictifs.
- Types, ESLint, Oxlint, syntaxe du seed et inventaire des douze parcours vérifiés. Le parcours historique de réservation cible son select Produit explicitement pour éviter de confondre celui-ci avec le nouveau champ de recherche ; ses assertions sont conservées.
- Douze fixtures indépendantes : six usages sur deux surfaces, 501 produits par société, 100 unités fictives du dernier produit au dépôt source, coût de 789 centimes, rattachements cohérents et mots de passe réellement vérifiés. Zéro société de fixture reste après le contrôle.

operations-product-choices.spec.ts définit douze parcours compilés : recherche et pagination, panne/reprise, remplacement du produit supprimé, préservation des champs, vraie mutation dans la SQLite de recette et contrôle du solde ou de la ligne obtenue. Ces cas sont définis, sans prétendre qu'ils sont déjà exécutés dans la CI du nouveau code. Leur propre commit, ses deux CI et sa lecture hébergée restent à qualifier.

## Périmètre conservé

Le tableau de bord et le tableau de stock utilisent encore leur chargement Produit borné à 500. Les cartes/indicateurs de stock et les autres sélecteurs sont des lots distincts. Le lecteur minimal ne qualifie pas globalement toutes les relations ou tout le cycle de vie Produit. Pas de fournisseur réel, de mouvement hors recette, d'envoi, de stockage persistant, de charge ou de reprise après arrêt brutal qualifié par ces tests.

## Première exécution des parcours compilés

Les douze nouveaux parcours Produit passent dans les deux CI de ca6f6fb. La qualification complète reste rouge : deux parcours Client ne distinguent pas les deux paginations de la commande. Le [rapport de régression](ci-regressions.md) conserve ces échecs et la correction de périmètre des locators, sans assertion ni délai retiré. Ce passage des seuls parcours Produit ne vaut pas qualification globale du candidat.
