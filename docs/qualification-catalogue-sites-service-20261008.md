# Catalogue, sites/parc et droits des Analyses Service

Les trois lots ont été approuvés le 8 octobre. Le Catalogue et les listes Sites/parc disposent de recherches serveur et de pages de 25 ; les Analyses Service et leur ZIP respectent désormais le périmètre autorisé. Les tableaux, cartes, couleurs et commandes existantes sont conservés.

## Comportements vérifiables

| Lot | Vérification | Limite |
| --- | --- | --- |
| [Catalogue](contrat-catalogue-volume.md) | 603 références dont une variante et une inactive ; recherche au-delà de la première page, compteurs constants, choix du parent hors recherche/page, stock par agence active. | Prestations, options/composants et autres sélecteurs distincts. Le détail produit conserve ses listes existantes. |
| [Sites/parc](contrat-sites-parc-complets.md) | 201 sites et 301 équipements dans une agence autorisée ; recherches indépendantes, changement d’agence, compteurs d’enfants de société, refus d’un périmètre demandé hors droits. | Synthèses et sélecteurs des autres onglets restent distincts ; aucun nouveau CRUD. |
| [Analyses Service](contrat-analyses-service-droits.md) | Scores globaux indisponibles sans Finance ou avec agence limitée ; diagnostics et satisfaction restreints ; assertions indépendantes sur les vrais CSV compressés. | Autres scores partagés et tableaux de bord distincts ; pas de cohérence atomique annoncée entre toutes les agrégations parallèles de l’analyse. |

Les lectures de page/total Catalogue et Sites/parc utilisent des transactions Serializable, des ordres avec identifiant et des projections bornées. Les droits sont relus par le vrai wrapper ; aucune permission n’est élargie. Les ressources Catalogue restent partagées dans la société selon les droits existants ; leurs stocks sont limités aux entrepôts accessibles. Une requête échouée masque les anciennes lignes et permet une reprise. Les formulaires conservent leur saisie et le parent choisi.

## Régression initiale

La [preuve SQLite sur 8126729](evidence/20261008-service-analytics-permissions/README.md) conserve 20 échecs sur 26 cas. Les six réussites et les 1 023 autres tests réussis ne transforment pas cette exécution en validation des restrictions. La suite étendue utilise de vrais SQL, actions, DAL et route ZIP ; session/cache Next seuls sont simulés. Les exports sont maintenant vérifiés indépendamment, car les anciens cas échouaient dès leur première assertion sur la moyenne.

## Qualification du candidat

Les [contrôles locaux](evidence/20261008-service-analytics-permissions/local.json) passent : types, ESLint/Oxlint, 1 100 tests SQLite / 166 fichiers et build de 75 pages. La sélection finale passe 17 cas Catalogue, 20 Sites/parc, 40 Analyses Service et neuf anciens contrôles de stock. Le schéma PostgreSQL est validé sans connexion ; cela ne constitue pas une exécution SQL PostgreSQL.

Playwright charge 212 cas dans 44 fichiers. Cette découverte ne vaut pas exécution navigateur ; les deux CI propres au nouveau candidat restent à obtenir. Les nouvelles fixtures sont isolées par société et format, hors des anciens parcours partagés. Les captures de chaque page de volume gardent le budget de capture existant ; les anciens seuils, assertions et exclusions restent inchangés.

Les résultats de 949adca et 8126729 restent valides pour leur propre code ; ils ne qualifient pas par avance ces nouveaux lots. Main et la démonstration hébergée restent distincts du candidat.
