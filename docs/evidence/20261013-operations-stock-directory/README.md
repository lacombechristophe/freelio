# Tableau et indicateurs de stock complets

Le [reproducteur](reproducer.test.ts.txt) sur ca6f6fb crée 501 produits fictifs actifs et suivis, sans inventaire. Le SQL confirme 501 références, mais le rendu réel du tableau de bord affiche 500 stocks bas. Le [rapport initial](before.json) conserve le cas rouge. Le lot visible a été [approuvé](../../contrat-operations-stock-complet.md).

Le lecteur authentifié utilise les règles d'inventaire de la société et des agences courantes. Il parcourt les références par lots de 250 dans une transaction Serializable, puis retourne une page de 25, les indicateurs complets et cinq références critiques. Recherche et pagination ne réduisent pas les indicateurs. L'ordre label/id stabilise les pages et les prévisualisations.

Quantités, seuils et valeurs sont additionnés en entiers exacts côté serveur. Une valeur hors de l'intervalle des entiers sûrs devient indisponible ; aucun zéro ou total partiel ne la remplace. Le formatage conserve les centimes exacts, même près de cette limite. Les règles existantes des produits actifs/non suivis et des dépôts historiques restent explicites dans le contrat.

## Vérification locale

Les [112 contrôles ciblés](local-after.json) passent, dont 29 nouveaux cas Stock et les 83 contrôles Client/Produit/périmètre fournisseur conservés. Les nouveaux cas couvrent le compteur réellement rendu, 21 pages sans doublon, recherche SKU/libellé, égalités de libellés, seuil exact, agences, huit rôles, révocations, références étrangères, paramètres invalides, précision monétaire et lecture seule sans écriture de stock ou d'audit.

Auth.js, cache/navigation Next et imports dynamiques sont simulés. Prisma, permissions, transactions, lectures et rendu OperationsCenter restent réels. Les fixtures appartiennent à des sociétés de recette isolées. Les [deux fixtures navigateur](seed.json) sont exécutées et vérifiées, puis supprimées : 501 produits chacune, dernier produit avec 12 unités, deux réservées, seuil dix et valeur de 9 468 centimes. Aucune société de fixture ne reste après ce contrôle.

Deux parcours compilés sont définis pour ordinateur/mobile : total 501, prévisualisation explicite, valeur d'agence, pagination, recherche du dernier produit, filtre d'agence, panne/reprise et préservation d'un formulaire ouvert. Les inventaires, mouvements, audits et envois sont contrôlés après lecture. Leur exécution dans les deux CI du commit publié reste requise ; l'inventaire des tests ne prouve pas leur passage.

## Limites

Les cartes Sites/Chantiers/SAV/Achats et les autres sélecteurs restent séparés. Le choix Produit d'une ligne d'achat fournisseur conserve son ancien plafond ; il n'alimente plus les indicateurs de stock. Aucun mouvement réel, fournisseur métier, stockage durable, test de charge ou reprise après arrêt brutal n'est qualifié par ce lot. La transaction de lecture a un plafond de 30 secondes ; ces tests de 501 références ne prouvent pas sa capacité à traiter un catalogue arbitrairement grand.
