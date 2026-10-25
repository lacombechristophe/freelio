# Gestion des sites et équipements

Les commits `e0bf911` et `4463f67` séparent règles métier, migration et parcours d’édition. La [portée fonctionnelle](../../gestion-sites-equipements.md) décrit les droits, versions, références actives et historiques conservés. Le transfert entre agences constitue un complément distinct.

La suite complète de `4463f67d66c6c0c34dbba14a443839e4f7bd7cd0` réussit **2 635 tests dans 234 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Les cinq suites du lot comportent 124 cas : édition, coordonnées/dates, versions concurrentes, activité, droits, import/rejeu, renouvellement, choix hors page et frontière des erreurs serveur. Les types, ESLint, Oxlint et le build de production passent ; les 76 pages statiques sont générées.

Les six modules de couverture configurés passent les seuils conservés : 85,53 % des instructions, 67,03 % des branches, 89,56 % des fonctions et 88,53 % des lignes. Ce résultat mesure ces modules, pas toute l’application. Le [relevé](local.json) conserve les empreintes des sorties natives, des logs et des 1 104 fichiers source comparés au commit, sans différence.

La vérification d’évolution crée une autre base fictive selon le schéma antérieur aux deux colonnes. Après ajout, elle retrouve les six lignes de société, client, site, équipement, SAV et intervention à l’identique ; le statut technique importé, les liens et les dates sont conservés. Les deux nouveaux index sont présents et le contrôle des clés étrangères est sans erreur. Les colonnes d’activité commencent à `NULL` : aucun dossier existant n’est désactivé implicitement.

Les tentatives précédentes restent identifiées : un premier contrôle manque le prédicat Produit retourné par le scope ; un autre ajoute un champ inutile au DTO minimal et échoue sur huit assertions. Les corrections conservent le DTO à trois champs et les tests existants. Quatre cas supplémentaires reproduisent une réouverture par import sur un site désactivé ; ils passent après recontrôle, tout comme les mises à jour de dossiers clos.

Le premier diagnostic comporte deux témoins réussis et onze refus manquants. Une partie de ces refus porte sur l’activité nouvellement introduite ; ce ne sont pas onze vulnérabilités d’une version publiée. Auth.js et le cache Next sont simulés ; les actions Prisma, transactions et contraintes SQL sont réelles.

Les 444 cas Playwright, 222 par surface, sont **sélectionnés, pas exécutés**. PostgreSQL, concurrence sur ce moteur et navigateur compilé restent à qualifier. Aucun push, workflow ni déploiement n’est déclenché avant vérification du plafond GitHub Actions à 0 €. Les résultats distants de `8d22323` ne qualifient pas ce lot local.
