# Listes complètes des commandes et réservations actives

## Diagnostic

Sur `0b6b8b3`, les deux cartes de l'onglet Commandes utilisent directement les tableaux de `getOperationsDashboard`. Chaque tableau est limité aux 150 lignes les plus récentes, sans recherche ni pagination de cette liste. Une recette avec 151 commandes et 151 réservations actives cohérentes confirme la perte des deux lignes les plus anciennes : quatre assertions de complétude échouent, deux témoins des lignes récentes passent. Ce diagnostic concerne la liste visible, pas la nécessité de charger toutes les lignes au démarrage.

Les fixtures sont insérées directement dans une base fictive. Les réservations possèdent un stock correspondant ; la recette de lecture ne qualifie pas leur création ni leurs mouvements. Session/cache sont simulés ; SQL, DAL et lecteur sont réels.

## Lot approuvé le 9 octobre 2026

Ajouter une recherche indépendante, un total accessible, le numéro de page et les commandes « Page précédente / Page suivante » dans chacune des deux cartes, par 25. Conserver le filtre d'agence et les cartes existantes. Les lecteurs paginés doivent appliquer société, agences et droits avant recherche, total et pagination ; les données de facturation gardent la projection approuvée.

Réserver « Consommer » et « Libérer » aux utilisateurs disposant de `operations.write`, hors démo publique en lecture seule. Les prix, états opérationnels, commandes de facturation déjà protégées, livraisons, couleurs et disposition générale sont conservés. Les recherches portent sur les références accessibles ; un résultat périmé ne doit pas remplacer celui d'une recherche plus récente. Après une mutation, relire la page et ajuster une page devenue vide.

Vérifier plus de 150 lignes, recherche d'une ligne ancienne, fin de pagination, isolation société/agence, droits Finance et Opérations, révocation, rôle Viewer et démo publique. Qualifier les deux listes sur PostgreSQL et dans le navigateur compilé. Les historiques de réservations terminées, autres listes et sélecteurs restent distincts.
