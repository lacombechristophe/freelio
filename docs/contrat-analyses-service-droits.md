# Analyses Service — restriction des données

## Défaut reproduit

Sur `8126729ce8b163cf05ee5eba5ca9d0d137538b53`, 20 des 26 assertions de restriction échouent en SQLite. Les tickets restent filtrés par agence, mais les diagnostics et réponses de satisfaction dépassent ce périmètre. Des enfants portant la société locale peuvent aussi référencer un ticket ou un questionnaire d’une autre société. La moyenne et les cohortes de santé utilisent le score global, qui peut dépendre de règles financières ; Technicien, SAV et Viewer limité à une agence reçoivent cette information. L’export reproduit la divulgation de la moyenne. Les [preuves](evidence/20261008-service-analytics-permissions/README.md) restent des régressions échouées, sans correction annoncée.

## Lot approuvé

Conserver les cartes, filtres, couleurs et commandes d’export. Dans « Santé moyenne » et « Santé du portefeuille », afficher « Historique global indisponible » sans Finance ou pour un membre limité à des agences, sans moyenne, cohortes ou tri dérivé du score global. Owner/Admin conservent ces indicateurs de société.

Limiter diagnostics et satisfaction aux sociétés des relations concernées, puis aux tickets des agences autorisées. Pour les membres limités à des agences, une réponse sans ticket rattaché à une agence accessible est exclue ; Owner/Admin conservent les réponses de société sans ticket. La satisfaction reste indépendante du filtre de responsable et de priorité, dans ce périmètre autorisé. Modifier son détail en « Réponses sur le périmètre accessible, sans filtre d’agent » ; les cohortes de tickets conservent leur définition actuelle.

Dans l’export ZIP, conserver les fichiers et colonnes ; remplacer la valeur de santé inaccessible par la même mention, sans cohortes numériques, et préciser ce périmètre dans le manifeste. Relire membership, rôle et agences actifs pour chaque action et export ; aucune matrice de droits élargie. Aucun nouvel envoi ni service externe.

## Qualification attendue

Transformer le reproducer en suite active après accord, avec cas indépendants pour chaque fichier d’export et contrôle positif Owner/Admin. Vérifier SQLite/PostgreSQL, ordinateur/mobile, révocation/suspension, réponse sans ticket, agence étrangère et relations de société incohérentes. Contrôler le contenu réel du ZIP et l’absence de requête de santé globale quand elle est inaccessible.

Ce lot ne clôture pas les scores partagés des annuaires, fiches Client, espaces CRM/Service et Automatisations, ni tous les champs des tableaux de bord. Leur lecture nécessite une recette et un contrat distincts.

Statut : lot approuvé le 8 octobre, puis implémenté. La suite active sépare chaque fichier d’export et ajoute les contrôles positifs Owner/Admin, l’absence de requête de score inaccessible et les réponses sans ticket. La [qualification commune](qualification-catalogue-sites-service-20261008.md) distingue la régression initiale, les tests SQL étendus et la CI propre au candidat.
