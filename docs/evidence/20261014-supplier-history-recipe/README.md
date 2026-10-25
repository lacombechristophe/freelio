# Recherche et indicateurs fournisseur

Les [deux CI de 6e01927](../20261014-build-memory/ci-6e01927.json) dépassent cinq secondes dans le contrôle qui enchaîne deux fiches complètes et trois recherches. Les autres assertions de cette suite passent. Les logs mesurent environ deux secondes par fiche et jusqu'à deux secondes par recherche de retours ; ce résultat n'est pas présenté comme un succès PostgreSQL.

Les trois recherches deviennent trois cas indépendants. Chacun vérifie les six indicateurs exacts de la fixture après sa recherche : 101 commandes, 104 950 centimes hors commandes annulées, 100 reçues, 50 à temps, 51 incidents ouverts et 301 produits. La lecture initiale redondante est remplacée par ces attentes fixes, déjà établies par les cas de contrôle. Toutes les recherches restent exécutées ; leur effet est vérifié séparément. Les actions de production, transactions, filtres et délai de cinq secondes restent inchangés.

Le [rejeu SQLite ciblé](local-after.json) passe les 21 cas des historiques et les deux cas de transmission mémoire. Les 21 cas passent ensuite sur PostgreSQL réel dans les deux CI de a01ce4c ; l'[état du candidat](../../completude-recette-20261003.md) conserve séparément ses échecs globaux. Cette modification de recette ne constitue pas une optimisation ni une qualification de charge du lecteur fournisseur.
