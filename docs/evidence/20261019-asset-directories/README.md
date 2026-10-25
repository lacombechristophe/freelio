# Relations des annuaires Sites et parc

Le commit `cd0f96542a38af4fc07e48ced3332814603e6ec3` applique aux annuaires les prédicats communs de société, agence et relations métier. Les recherches restent combinées par `AND` à ces prédicats ; leur `OR` ne remplace pas une règle d'accès. Les compteurs imbriqués utilisent eux aussi les périmètres Équipement et SAV.

La reproduction comporte huit cas : un témoin réussi et sept échecs, dont des références vers une agence étrangère pour Owner/Admin, un produit étranger pour trois rôles et deux compteurs trop larges. Après correction, dix cas dédiés passent, avec recherche directe et par site. Les quatre suites Sites/parc, synthèse et fiches Opérations terminent **109 tests réussis**, sans échec ni exclusion. Les historiques cohérents et les produits optionnels restent accessibles ; les lecteurs ne modifient aucune donnée.

Le [relevé](local.json) conserve les empreintes natives, la comparaison des 1 088 fichiers source au commit et les sorties de types, ESLint, Oxlint et build, tous réussis. Auth.js est simulé ; les actions, contraintes et lectures Prisma utilisent une SQLite fictive isolée. La suite complète antérieure de 2 501 cas concerne `3836dc4` ; elle ne qualifie pas ce changement ultérieur.

Le nouveau scénario prépare la vérification des cartes, compteurs et recherches avec Owner puis Technician. La sélection compte 442 cas, 221 par surface ; elle ne les exécute pas. PostgreSQL et navigateur de ce complément restent à qualifier. Aucun push ni workflow n'est lancé avant vérification du plafond GitHub Actions à 0 €. Le cycle d'édition et de désactivation des sites/équipements constitue un travail distinct.
