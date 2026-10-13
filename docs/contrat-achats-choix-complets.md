# Choix complets de la commande fournisseur

Le diagnostic SQL isolé sur le code Stock préparé depuis bfe5d6b confirme 501 produits actifs et 301 chantiers actifs ; getOperationsDashboard omet le dernier produit et le dernier chantier. PurchaseOrderDialog consomme directement ces deux listes bornées (500/300), sans recherche serveur. Trois cas : contrôle des populations réussi, deux assertions de présence échouées. Le reproducteur et le rapport sont conservés dans Freelio-purchase-choices-diagnostic, hors dépôt.

Lot visible proposé : recherche référence/libellé, total et pages de 25 auprès du choix Produit de chaque ligne d'achat ; recherche du nom, total et pages de 25 auprès du choix Chantier. Conserver les selects natifs, le fournisseur, les lignes libres, quantités/prix, libellés modifiés, date et instructions. Conserver chaque choix hors page ; recherche, erreur et actualisation ne réinitialisent pas les lignes. Le coût courant peut préremplir le prix uniquement lorsqu'un nouveau produit est choisi explicitement, comme aujourd'hui. Une sélection introuvable peut être remplacée ; création bloquée tant que les sélections présentes ne sont pas vérifiées. Aucun envoi fournisseur, couleur ou changement de bouton métier.

Lectures Operations authentifiées avec paramètres stricts ; produits actifs de la société, chantiers actifs cohérents avec leur client et les agences autorisées. Les identités de lignes seront stables pour préserver le bon choix lorsqu'une autre ligne est retirée. Aucun rattachement automatique d'anciennes données, ni droit nouveau. Le plafond Produit résiduel du tableau de bord pourra être retiré après remplacement de ce dernier consommateur.

Recette prévue : SQL réel 501 produits/301 chantiers, pagination, choix séparé, société/agence/rôles, disparition et paramètres invalides ; navigateur compilé desktop/mobile, plusieurs lignes indépendantes, préservation du prix saisi, panne/reprise, retrait d'une ligne, choix disparu/remplacé et création d'un brouillon fictif cohérent sans envoi. Les indicateurs et historiques Achats restent un lot séparé.

## Accord et réalisation

Lot approuvé le 14 octobre 2026 (heure de Paris) : « Oui, compléter ces choix d’achat fournisseur ». Deux lecteurs authentifiés distincts préservent les DTO minimaux : Produit transmet id/référence/libellé/coût courant ; Chantier transmet seulement id/nom. La sélection est relue séparément de la recherche dans la même transaction Serializable. Le périmètre des projets reste actif, cohérent avec le client et les agences autorisées.

Les lignes ont une identité stable. Chaque recherche est indépendante et ignore ses réponses périmées. Les prix/libellés saisis ne sont préremplis que lors d’un choix explicite ; actualiser les résultats ne remplace pas leur valeur. Fermer puis rouvrir le formulaire initialise une nouvelle saisie, comme auparavant. Les rafraîchissements doux des données ne remontent pas le formulaire ouvert.

Les produits bornés et inventaires détaillés inutilisés sont retirés du payload de tableau de bord après remplacement de leur dernier consommateur. Les autres historiques et l’intégrité globale de création Achat restent à qualifier séparément ; ce lot ne présente pas les protections des sélecteurs comme une qualification de toutes les actions d’achat.
