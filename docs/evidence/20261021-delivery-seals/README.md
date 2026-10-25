# Commandes client et capture des bons de livraison

Production : `c74504317350f215200e0710f6afe91aa71f4b89` ; complément de tests : `3662492517adeac981523a65095abd7e8d26bd98`. Le [contrat](../../commandes-livraisons-scellement.md) définit montants, droits, références, quantités et contenu scellé.

La [recette](local.json) passe **3 268 tests dans 268 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les 43 cas commande/livraison et 74 cas de choix Client/Produit sont présents dans cette même exécution. Le manifeste correspond exactement aux fichiers suivis ; les 1 196 fichiers source de la recette correspondent au commit final.

Le [diagnostic](baseline.json) conserve 21 échecs sur 22 cas : audit absent, références incohérentes acceptées, lecture HTML non isolée, reliquat décimal, annulation périmée et document signé recalculé. Il ne représente pas 21 vulnérabilités indépendantes. Le premier cas de montants échouait sur son audit manquant ; les assertions de centimes avaient passé. Les corrections de fixture TVA et de quantité déjà livrée sont explicites dans les métadonnées.

Les vraies transactions et routes sont exercées avec authentification/cache simulés. Un refus SQL réel d’insertion d’audit restaure commande, bon et compteurs. Le contenu chiffré garde son empreinte après modification des données courantes ; une capture valide copiée avec son empreinte vers un autre bon est refusée. Un changement pendant préparation conserve l’édition légitime et empêche le scellement. Les captures ne sont pas exposées dans la liste du tableau de bord.

Types, lints et build de 76 pages passent. Le build porte sur c745043 ; 3662492 ne change que les cas de test. La migration nullable conserve huit lignes fictives de six tables et les anciens horodatages/empreintes. Le diff PostgreSQL correspond au SQL versionné ; **la migration PostgreSQL n’est pas exécutée**. La couverture reste celle des six modules déterministes configurés, pas de toute l’application.

## Reproduction et limites

Dans une copie isolée avec dépendances installées, DATABASE_URL SQLite neuve et secrets fictifs : `node scripts/sync-prisma-schemas.mjs`, `node scripts/prepare-dev-database.mjs`, puis `node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism --reporter=json --outputFile=recette.json`. Le contrôle de mise à niveau `node scripts/verify-delivery-seal-upgrade.mjs` crée sa propre base externe.

Le [parcours Playwright](../../../tests/e2e/delivery-seal.spec.ts) prépare réservation, consommation, livraison et accusé, puis vérifie la capture et l’indisponibilité historique dans une société fictive indépendante. **460 cas sélectionnés, 230 par surface, aucun navigateur exécuté.** La préparation des polices est simulée dans le test SQL ; le rendu PDF natif reste à qualifier. La capture HTML et ses ressources sont conservées, les octets PDF sont produits à la demande. Les listes/sélecteurs de livraison, l’annulation après livraison et la réparation historique restent distincts. Aucun fournisseur contacté, push, nouvelle CI, fusion ou déploiement ; ce lot ne clôt pas tout L8/L9.
