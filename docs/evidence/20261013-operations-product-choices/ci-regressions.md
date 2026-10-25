# Régression du sélecteur Client après ajout du choix Produit

Les deux CI de ca6f6fb échouent : branche 38463635208 et PR 38463641126. Résultat navigateur : 403 réussis, 19 exclusions historiques et deux échecs, les parcours Commande client sur ordinateur/mobile de operations-client-choices.spec.ts. Les douze nouveaux parcours Produit passent dans chaque CI.

Le test Client cherche « Page suivante » dans tout le formulaire. La commande contient désormais deux paginations, Client et Produit : le locator résout deux boutons, même si celui du Produit est désactivé. Après correction du bouton, les totaux et alertes doivent également rester propres au champ Client ; son zéro résultat peut coexister avec le zéro résultat Produit.

La correction limite recherche, select, pagination, totaux et alertes au conteneur du label clientId. Le bouton d'enregistrement et les assertions sur la saisie, les créations et les données SQL restent au niveau du formulaire. Aucune assertion n'est supprimée ; aucune application, donnée métier, couleur ou limite de test n'est changée.

Les [rapports rouges](../20261013-candidate/ci-ca6f6fb.json) sont conservés avec les deux audits sans vulnérabilité, 2 258 SQLite et 2 257 PostgreSQL plus une exclusion native SQLite, ainsi que les neuf contrôles Linux. L'[identité du code](../20261013-candidate/source-ca6f6fb.json) et la [lecture hébergée](../20261013-candidate/hosted-ca6f6fb.json) sont reliées au candidat. La consultation de 49 pages/onglets par surface ne remplace pas les deux parcours compilés échoués. ca6f6fb n'est pas présenté comme entièrement qualifié.
