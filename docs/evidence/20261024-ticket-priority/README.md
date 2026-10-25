# Index du classement des tickets SAV

La [CI de `4e83175`](https://github.com/lacombechristophe/freelio/actions/runs/40119295139) échoue sur PostgreSQL : la synthèse de 10 001 tickets fait expirer sa transaction de cinq secondes. Les jobs desktop, mobile et Linux réussissent ; cette réussite partielle ne valide pas le candidat complet.

La même assertion échoue sur PostgreSQL 18.3 isolé : une lecture de tickets dure 8 788 ms. Le classement filtre par société et priorité, puis trie par dernière modification et identifiant. Le nouvel index suit cet ordre ; les prédicats d'accès, les six résultats maximum et la limite de cinq secondes sont conservés.

Le [reçu local](local.json) relie le diagnostic aux résultats après correction : les 74 migrations sont appliquées sur une nouvelle base fictive, les 30 cas PostgreSQL passent et la lecture du corpus prend 212 ms. Sur SQLite neuve, 93 cas voisins passent. Ces durées décrivent une exécution locale, sans engagement de performance hébergée.

Le SQL versionné correspond au diff Prisma généré et ajoute uniquement un index. Les anciens fichiers de migration sont conservés. Ce lot n'applique aucune migration hébergée : une instance encore à 73 migrations doit recevoir la mise à niveau avant de servir le nouveau candidat, dont la sonde exige l'historique complet. La CI du commit de correction reste nécessaire.

La CI de `da774d7` révèle ensuite trois assertions de journalisation restées à 73 migrations. Le test capture désormais le nombre du manifeste complet avant de retirer ou modifier une entrée, puis vérifie exactement le diagnostic attendu. Les trois fichiers voisins passent : 43 cas. Ce correctif concerne le test, sans changement de la sonde ou des conditions de disponibilité.
