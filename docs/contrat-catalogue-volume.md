# Catalogue à volume — proposition

La recette 5616823 charge 602 produits fictifs supplémentaires dans la société utilisée par tous les parcours. Le catalogue rend chaque référence ; son audit ordinateur/mobile ne termine pas la capture en une minute. Les rapports conservent un P2 « contenu restant non inspecté », sans défaut P0/P1 constaté. Les seuils et assertions restent inchangés. Isoler les données Fournisseurs évite de polluer les autres parcours, mais ne qualifie pas le catalogue à ce volume.

## Lot proposé

Conserver la recherche existante des produits et la faire porter côté serveur sur toutes les références accessibles (SKU, nom, famille, fabricant, variante). Ajouter les commandes de pagination existantes par 25, avec total et numéro de page. Les compteurs références actives, variantes et groupes d’options restent calculés sur l’ensemble accessible, indépendamment de la page ou recherche.

Dans le formulaire produit, ajouter recherche et pagination par 25 au sélecteur « Produit parent ». Conserver le parent choisi même hors recherche/page ; ne pas utiliser la page courante du catalogue comme liste de parents. Les règles actuelles de parenté restent appliquées côté serveur. Conserver tableaux, cartes, champs d’édition, couleurs et boutons actuels.

## Lecture et vérification

Lecteurs sous les permissions actuelles, avec société/membership/agences relus ; stocks uniquement dans les entrepôts accessibles. Total, page et agrégats cohérents, entrées bornées et ordre stable. L’édition ouverte conserve ses données lors d’une recherche ; erreur et reprise ne se présentent pas comme une absence de produits. Aucun fournisseur externe ou mutation supplémentaire.

Recette dédiée avec plus de 600 références, parents au-delà de la première page, variante avec parent hors filtre, inactifs, société/agence étrangère, révocation et démo publique. Vérifier la dernière page, la recherche sur tout le catalogue et les totaux constants ; audit complet de chaque état paginé sur ordinateur/mobile, sans relever le budget de capture. La pagination des prestations, autres sélecteurs et configuration d’options/composants restent des lots distincts à examiner.

Statut : proposition ; aucun changement de cette interface n’est appliqué sans accord spécifique.
