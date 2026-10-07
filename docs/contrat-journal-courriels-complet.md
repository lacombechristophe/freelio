# Journal des e-mails : portefeuille complet — proposition

Date : 8 octobre 2026. Sous-lot AUTO-05 préparé ; ni accord visible ni implémentation présumés.

## Constat

getAutomationData charge seulement les 50 dernières livraisons ; le Journal filtre ensuite ces lignes en mémoire. Le filtre de séquence déduit aussi ses choix de ces mêmes livraisons. Un ancien échec peut être inaccessible malgré les compteurs globaux. L’ACL de boîte existe déjà dans l’extension Prisma et doit être conservée dans les requêtes paginées et les détails.

## Lot visible proposé

Dans Automatisations → Journal → E-mails, conserver les cartes, styles, couleurs et commandes de traitement/reprise. Porter la recherche et le filtre d’état existants sur tout l’historique accessible. Ajouter Page précédente / Page suivante, 25 lignes par page, total et numéro de page. Remplacer le filtre Séquence actuel par un sélecteur recherchable avec pages de 25, conservant la sélection choisie lorsqu’on cherche/changera de page. Le choix Toutes les séquences reste disponible. Aucune nouvelle commande d’envoi ni page métier.

## Contrat serveur

Requêtes SQL sous société et ACL de boîte ; ordre créé le / ID stable ; compte total et page cohérents dans une transaction, page hors borne ramenée à la dernière. Projection limitée aux métadonnées déjà autorisées ; aucun payload, CC/CCI, secret, pièce privée ou corps de message dans le journal. Le détail relit la ligne autorisée par son ID ; une boîte devenue inaccessible ne reste pas consultable depuis un ancien résultat client.

La recherche porte sur objet, destinataire et nom de séquence ; l’état et la séquence sont appliqués avant count/skip/take. Les choix de séquence proviennent des séquences de la société accessibles, sans plafond total ni filtrage client d’une première tranche. Les refus de relance expirée approuvés restent appliqués côté serveur, quelle que soit la page consultée. Démo publique : lectures seules, mutations toujours refusées.

## Recette de fermeture

Au moins 101 livraisons et 51 séquences fictives, dernière ligne retrouvée par recherche et pagination, filtres combinés, même nom recherché avec choix conservé, page devenue vide après changement de filtre. Société étrangère, boîte privée d’un autre membre, accès révoqué après ouverture, rôle lecture seule et démo. Ordinateur/mobile : pages, recherche de la dernière ligne, sélection d’une séquence hors première page et détail/refus de relance. Types/lint/build et CI du SHA exact.

Ce lot ne fournit ni nouvelles preuves distantes ni classement/réparation des envois automatiques incertains. Cette reprise humaine reste distincte, avec règle explicite de progression/arrêt de l’inscription avant implémentation. Les autres plafonds de modèles/scénarios/suppressions sont suivis séparément ; la pagination de ce journal ne les efface pas.
