# Temps : historique et choix de chantier complets

Lot approuvé le 12 octobre 2026 après une recette SQL de 501 temps et 21 chantiers : les lecteurs actuels renvoient seulement 500 temps et 20 chantiers, avec des indicateurs et un export incomplets.

- Recherche serveur dans tout l'historique autorisé, sur description, chantier et client ; pages de 25, total et commandes précédent/suivant. Tri stable par date puis identifiant.
- Indicateurs et export CSV sur le même périmètre recherché, indépendamment de la page. Un export doit parcourir les résultats par lots bornés sans contourner les droits ou tronquer silencieusement le résultat.
- Journées et semaines calculées dans le fuseau configuré de la société, identiquement sur le serveur et dans le navigateur. La semaine conserve son début au lundi ; les dates stockées ne sont pas réécrites.
- Choix de chantier du chronomètre et de la saisie manuelle recherchables et paginés par 25, avec une sélection vérifiée séparément et conservée hors page. Recherche, erreur ou rafraîchissement ne doivent pas effacer la saisie ni le chronomètre.
- Lectures réservées à Opérations, relations bornées à la société et au client cohérent, agences respectées. Les écritures conservent les protections du lot d'intégrité.

Champs, cartes, couleurs et commandes existantes conservés. Le portefeuille Chantiers lui-même et la facturation concurrente restent séparés. Recette attendue : au-delà de 500 temps et 20 chantiers, scopes réels, export complet, fuseaux, changements de page et reprise d'une sélection dans le navigateur compilé.
