# Stock complet : tableaux et indicateurs

## Constat

La recette sur ca6f6fb crée 501 produits actifs suivis en stock, sans aucune ligne d'inventaire. Le contrôle SQL confirme 501 produits éligibles. Le rendu réel d'OperationsCenter, avec getOperationsDashboard, affiche « Stocks bas : 500 » au lieu de 501. Authentification et navigation Next sont simulées, ainsi que les composants chargés dynamiquement ; le composant, les formules et Prisma restent réels. Le reproducteur et le rapport sont conservés dans le répertoire temporaire Freelio-stock-dashboard-diagnostic. Aucun serveur local ni fournisseur métier n'est utilisé.

La lecture des consommateurs confirme que le même payload Produit borné alimente la table Stock par produit, la prévisualisation Stock critique et les disponibilités/valeurs de stock de la comparaison des agences. Le lot de choix Produit ne corrige pas ces indicateurs.

## Lot visible proposé

- Ajouter recherche par référence/libellé, total et pages de 25 (précédent/suivant) dans Stock par produit, sur tout le catalogue actif accessible, avec le filtre d'agence conservé.
- Calculer Stocks bas et les mesures de stock de la comparaison des agences sur tout l'inventaire accessible, sans les tronquer à la page recherchée.
- Conserver cinq références dans Stock critique, issues du périmètre complet, et préciser « 5 affichées sur [total] » pour distinguer cette prévisualisation du total réel.
- Afficher « Valeur indisponible » si une valeur totale dépasse la capacité de représentation exacte ; ne pas substituer une valeur partielle ou zéro.
- Conserver recherche, agence et autres formulaires/saisies lors d'une actualisation ou erreur. Garder composants, couleurs, prix et commandes de stock existants ; aucun nouveau mouvement ni changement de permission.

## Mise en œuvre et recette prévues

Lecture authentifiée Opérations avec filtre société et règles d'inventaire/agence actuelles, paramètres stricts, ordre stable et pagination bornée. L'inventaire reste la source de vérité ; les agrégats, références de prévisualisation et page doivent être cohérents dans leur snapshot. Ne pas charger tout le catalogue dans le navigateur ni élargir les droits.

SQL : 501 références, dernière référence, stocks à zéro et au-delà du premier lot, recherche/page indépendante des indicateurs, agences accessibles/interdites, actifs/non suivis, sociétés étrangères, limites de valeur et rôles. Rendu du compteur réel puis parcours compilés ordinateur/mobile, panne/reprise et maintien des formulaires. Aucun fournisseur réel ni écriture de stock hors fixtures.

## Limites

Les compteurs sites, projets, SAV et achats n'appartiennent pas à ce lot. Les comparaisons conserveront leurs autres mesures tant qu'elles n'auront pas été qualifiées séparément. Aucun changement de règle pour les dépôts historiques, de prix saisi, de réservation, de valorisation comptable ou de mouvement existant.

## Accord et réalisation

Lot approuvé le 13 octobre 2026 : « Oui, compléter tableaux et indicateurs de stock ». Le lecteur transmet 25 lignes et les agrégats complets dans un snapshot Serializable ; il parcourt les produits par lots de 250 côté serveur. Les quantités et valeurs sont additionnées en BigInt, puis transmises uniquement si elles sont des entiers sûrs. La présentation monétaire conserve les centimes exacts.

Les produits sans inventaire restent critiques à zéro dans Toutes les agences, selon la règle existante. Le périmètre d’une agence exclut les références sans inventaire dans ses dépôts actifs. Les dépôts historiques inactifs et sans agence restent inclus dans Toutes les agences pour Owner/Admin ; ils ne sont pas ajoutés à la comparaison des agences. Les non-suivis actifs participent aux quantités/valeurs mais pas aux alertes.

Le payload Produit borné subsiste uniquement pour le choix de ligne d’achat fournisseur ; il n’alimente plus les tableaux ou indicateurs de stock. Sa complétude reste un lot séparé. La qualification locale ne remplace pas les CI PostgreSQL et navigateur du commit publié.
