# Revue UI/UX et plan de finition — 5 septembre 2026

## Diagnostic

Le produit a une identité cohérente (navigation marine, sélection cyan, actions bleues), mais sa hiérarchie reste trop souvent guidée par les composants disponibles plutôt que par la tâche. La conformité technique de l’audit précédent ne constitue pas une validation esthétique ni une preuve de parité fonctionnelle avec HubSpot/Extrabat.

Revue directe des **56 captures desktop et 56 captures mobile** de `test-results/full-ui-audit`, rapprochées des maquettes fournies par le propriétaire. Les planches de comparaison locales sont dans `tmp/design-review-20260905`. Les captures actuelles couvrent le premier écran du conteneur interne ; leur option `fullPage` ne capture pas son défilement. Les vues secondaires, données abondantes, états d’erreur et modales demandent donc des preuves complémentaires.

### Problèmes prioritaires observés

1. **P1 — mobile : contenu principal repoussé par les compteurs.** Communications, prospects, fiches contact/équipement/ticket, satisfaction, rapports et comptabilité empilent trois à six grands blocs avant la tâche.
2. **P1 — états vides coupés.** Devis/factures/contrats/dépenses utilisent une cellule centrée dans un tableau de largeur minimale 680 px ; le message et son bouton se retrouvent hors écran sur téléphone.
3. **P1 — navigation ambiguë.** Banque + Comptabilité, Récurrences + Factures, Agences + Paramètres sont actifs simultanément. L’espace réservé aux favoris tronque plusieurs libellés même lorsque l’étoile est invisible.
4. **P1 — ordre des informations.** Les vues CRM et SAV mettent les graphiques avant les clients/relances ou les tickets. Les propriétés personnalisées non configurées occupent un panneau entier en tête de nombreuses fiches.
5. **P2 — actions et réglages trop présents.** Le formulaire de sauvegarde d’une vue est permanent ; Paramètres affiche deux grands renvois vers d’autres pages avant ses propres champs. Les filtres SAV et les outils d’Opérations consomment beaucoup de hauteur.
6. **P2 — incohérences de vocabulaire.** « Projets », « Chantiers » et « Missions » désignent la même surface ; plusieurs statuts techniques anglais restent visibles dans des fiches.
7. **P2 — parcours secondaire insuffisamment documenté.** Une capture du premier onglet ne valide pas le studio de séquences, le constructeur de workflow, les intégrations OAuth, ni une modale de produit.

## Direction à conserver

- Conserver les maquettes du propriétaire : marine/cyan, surfaces claires, données lisibles, séparateurs fins, actions bleues. Pas de nouvelle direction artistique ni de chronomètre dans la navigation.
- Priorité au travail du pisciniste : qui contacter, quel dossier traiter, quelle intervention exécuter, quel document envoyer.
- Une action principale identifiable ; outils de configuration et création de règles révélés à la demande.
- Typographie produit commune, chiffres tabulaires, libellés complets, espacements réguliers. La densité doit économiser le défilement sans réduire le texte.
- Aucun chiffre, graphique, témoignage ou état de connexion fictif pour remplir une maquette.

## Plan d’exécution et critères de sortie

| Lot | Travaux | Vérification attendue | État |
|---|---|---|---|
| A — socle commun | Une seule destination active, libellés de navigation lisibles, compteurs compacts en mobile, états vides hors largeur du tableau, sauvegarde de vue progressive, propriétés absentes discrètes | Ordinateur 1280/1680, mobile 393 px ; retour clavier ; aucun message/bouton vide coupé | En cours |
| B — ordre des tâches | CRM et SAV : files d’action avant analyses ; Communications : accès immédiat à la boîte ; Paramètres : champs du profil avant renvois ; vocabulaire chantier homogène | La première action métier et au moins un dossier sont visibles sans traverser une pile de compteurs | À faire |
| C — parcours complets | Revoir onglets automatisations, séquences, workflows, modèles et journal ; opérations/planning/stock ; intégrations ; création devis/facture/contrat ; modales produit/client/ticket | Revue de chaque état utile, sélection, édition, annulation, erreur de validation et résultat ; HTML/PDF relus séparément | À faire |
| D — preuve visuelle | Capturer le contenu réel du conteneur et les points de défilement ; distinguer routes, dossiers et états ; conserver avant/après | Aucune affirmation « toutes les pages » fondée uniquement sur le premier écran ; limites explicites dans le rapport | À faire |
| E — livraison | Types, lint, tests pertinents, E2E étendus, migrations PostgreSQL, CI puis déploiement et smoke production | Commit exact vérifié ; connexion et protections HTTP ; rapport de livraison daté | À faire |

## Matrice de revue des routes

`Premier écran revu` signifie inspection visuelle effective de la capture desktop et mobile, pas validation de tous les états interactifs.

| Route sous `/dashboard` | Observation et travail attendu | Preuve actuelle |
|---|---|---|
| `/` | Cockpit cohérent ; raccourcir les états sans activité, garder priorités avant outils | Premier écran revu |
| `/crm` | Portefeuille et relances avant graphiques | Premier écran revu |
| `/clients` | Sauvegarde de vue progressive ; liste mobile lisible | Premier écran revu |
| `/clients/[id]` | Compteurs compacts ; prochaine action avant propriétés vides ; type en français | Premier écran revu |
| `/contacts` | Barre de vues plus discrète ; coordonnées prioritaires | Premier écran revu |
| `/contacts/[id]` | Écrire et coordonnées avant compteurs/paramétrage | Premier écran revu |
| `/leads` | Compteurs 2×2 ; liste accessible sans long défilement | Premier écran revu |
| `/communications` | Boîte d’abord, métriques secondaires ; vue mobile liste/détail et retour | Premier écran revu |
| `/marketing/overview` | Acquisition et actions distinguées ; éviter une grande analyse vide | Premier écran revu |
| `/campagnes` | Compteurs compacts ; création et campagne sélectionnée à revoir | Premier écran revu |
| `/marketing` | File prospects avant configuration de règles | Premier écran revu |
| `/automatisations` | Réduire les compteurs ; scénarios et préparation visibles ; auditer les 5 onglets | Premier écran revu |
| `/sales` | Pipeline + priorités avant modules secondaires ; doublon « Pipeline commercial » à revoir | Premier écran revu |
| `/pipeline` | Colonnes utilisables, défilement expliqué ; tester fiche et déplacement | Premier écran revu |
| `/devis` | Corriger vide mobile ; simplifier vue enregistrée | Premier écran revu |
| `/devis/new` | Synthèse utile ; limiter la bibliothèque avant la saisie ; un libellé d’enregistrement cohérent | Premier écran revu |
| `/devis/[id]` | Totaux compacts ; accord et prochaine étape visibles | Premier écran revu |
| `/contrats` | État vide mobile hors tableau | Premier écran revu |
| `/contrats/new` | Modèles repliables ; commencer par le destinataire ; relire PDF et édition | Premier écran revu |
| `/catalogue` | Bon modèle liste/cartes mobile ; vérifier recherche et modales | Premier écran revu |
| `/catalogue/produits/[id]` | Prix et marge compacts ; options et nomenclature à relire avec données | Premier écran revu |
| `/operations` | Filtre agence intégré ; onglets et tâches plus hauts ; vérifier 7 onglets | Premier écran revu |
| `/projets` | Renommer « Chantiers » ; cartes mobile à densifier | Premier écran revu |
| `/projets/[id]` | En-tête fluide ; jalons et budget avant configuration absente | Premier écran revu |
| `/organisation` | 4 indicateurs compacts ; distinguer tâches et agenda | Premier écran revu |
| `/terrain` | Hors ligne compréhensible ; formulaire et clôture à relire intégralement | Premier écran revu |
| `/temps` | Chronomètre uniquement dans sa page ; calendrier mobile plus compact | Premier écran revu |
| `/service` | File prioritaire avant répartitions | Premier écran revu |
| `/service/help-desk` | Compteurs et filtres raccourcis ; tickets visibles plus tôt | Premier écran revu |
| `/service/tickets/[id]` | Dossier avant doublons vides ; résumé compact ; conversation et actions à relire | Premier écran revu |
| `/service/equipements/[id]` | Fiche technique avant propriétés absentes ; statuts en français | Premier écran revu |
| `/service/interventions/[id]` | Résumé compact ; exécuter/terminer prioritaire sur annuler | Premier écran revu |
| `/service/diagnostics` | Bibliothèque avant nouveau formulaire quand elle est remplie | Premier écran revu |
| `/service/customer-success` | Portefeuille avant règles ; explication des scores contextuelle | Premier écran revu |
| `/service/analytics` | Filtres compacts ; indicateurs 2×N mobile ; graphiques sur données suffisantes | Premier écran revu |
| `/service/macros` | Bibliothèque + édition sélectionnée ; modèle à prévisualiser | Premier écran revu |
| `/service/connaissance` | Aperçu lecture par défaut ; édition sur demande | Premier écran revu |
| `/service/satisfaction` | Résultats et invitations avant création d’enquête permanente | Premier écran revu |
| `/revenue` | Encaissements à sécuriser avant analyse vide | Premier écran revu |
| `/factures` | État vide mobile ; barres d’actions regroupées | Premier écran revu |
| `/factures/new` | Synthèse et destination cohérentes avec devis ; aperçu intégral à revoir | Premier écran revu |
| `/factures/recurrentes` | Une seule navigation active ; vide utile et centré | Premier écran revu |
| `/factures/temps-non-facture` | État vide déjà clair ; revoir sélection avec données | Premier écran revu |
| `/depenses` | Vide mobile corrigé ; saisie/justificatif en priorité | Premier écran revu |
| `/comptabilite` | Compteurs mobile compacts ; export et limites explicites | Premier écran revu |
| `/comptabilite/banque` | Une seule navigation active ; import et rapprochement avec données | Premier écran revu |
| `/reports` | Résumé mobile compact ; détails des calculs accessibles | Premier écran revu |
| `/data` | Point d’entrée cohérent ; indicateurs sans signal à simplifier | Premier écran revu |
| `/migrations` | Étapes compactes en mobile ; simulation et rapport à inspecter | Premier écran revu |
| `/equipe` | Équipe existante avant invitation permanente ; coûts/horaires lisibles | Premier écran revu |
| `/settings` | Profil avant renvois de configuration ; chaque onglet à revoir | Premier écran revu |
| `/settings/agencies` | Liste d’agences avant schéma pédagogique ; navigation univoque | Premier écran revu |
| `/settings/properties` | Compteurs compacts ; présélections et validation des champs | Premier écran revu |
| `/billing` | Forfait actuel distinct du paiement actif ; cohérence des termes français | Premier écran revu |
| `/notifications` | Vide lisible ; actions désactivées compréhensibles | Premier écran revu |
| `/help` | Aide par tâche ; liens contextuels ; éviter les promesses de support non configuré | Premier écran revu |

Les fiches facture, contrat, opportunité, migration, achat/fournisseur et les variantes edit/amend ne sont pas toutes présentes dans cette base minimale. Elles seront inspectées sur la base de recette enrichie. Les pages publiques, le portail, la signature, l’authentification et les documents PDF ont leur propre recette ; ils ne sont pas couverts par ces 112 captures.

## Barème de décision

### Repères externes consultés

La [documentation HubSpot des listes et vues](https://knowledge.hubspot.com/records/view-and-filter-records), mise à jour le 11 août 2026, confirme l’importance des vues enregistrées, des filtres et de la personnalisation des tableaux. Le repère retenu ici est la rapidité pour retrouver un portefeuille de travail, pas l’accumulation de commandes visibles. La [présentation officielle Extrabat Piscine](https://www.extrabat.com/piscine/) sert de comparaison pour la continuité du dossier entre relation client, devis, chantier, planning et SAV. Ces sources publiques ne remplacent pas une recette dans les comptes réels de Xavier ; aucune parité exhaustive n’en est déduite.

- **Bloquant** : action impossible, données perdues, mauvaise information métier, bouton inaccessible.
- **Majeur** : tâche principale cachée, état vide coupé, navigation ambiguë, vocabulaire incompréhensible.
- **Finition** : alignement, densité, rythme, contenu redondant sans blocage.
- Une surface ne passe à « validée » qu’avec la route, le viewport, l’état testé et une preuve après correction. Un test automatique vert ne transforme pas un état non inspecté en état validé.

## Exécution du premier lot

Corrections implémentées, en attente de la recette navigateur finale :

- sélection de la destination la plus précise, y compris achats, fournisseurs, tickets, équipements et interventions ; libellés complets sans réserver en permanence l’espace du favori ;
- 16 résumés de listes/fiches en deux colonnes sur téléphone ; synthèse comptable alignée sur les autres espaces ;
- états vides de tableaux sur toute la largeur disponible, sans en-tête de colonnes inutile sur mobile ;
- sauvegarde de vue ouverte à la demande, retour d’erreur conservant la saisie, traitement asynchrone réellement attendu ;
- propriétés non configurées réduites à une ligne ; portefeuille, file SAV et encaissements placés avant les analyses ;
- boîte e-mail en premier, indicateurs dans Statistiques, liste/détail/retour mobile avec restitution du focus ;
- raccourcis Paramètres compacts, titre Chantiers et type de client en français ;
- canevas de devis/facture repliés par défaut, ajout sans perte des lignes saisies et focus vers la première ligne ajoutée ;
- filtres SAV repliés par défaut, action Nouveau ticket et correction fonctionnelle du filtre Tous : `status=ALL` était supprimé de l’URL, réappliquant involontairement le filtre Actifs.

`npm run verify` a réussi (286 tests unitaires, types, lint, build) avant la dernière correction du filtre SAV. Les captures intermédiaires de développement sont conservées dans `tmp/design-review-mobile-intermediate`. Ce parcours a été interrompu, pas déclaré réussi : recompilations à froid et timeout de connexion pendant une seconde recette concurrente. Le lancement du serveur local de production a ensuite été refusé par l’environnement ; aucune modification des protections d’authentification n’a été faite pour le contourner. La recette de production passe par la CI existante du dépôt.

La recette ajoutée vérifie les états vides filtrés, la sauvegarde progressive, la boîte mobile et le focus, la priorité des files métier, la préservation des lignes de devis et le filtre Tous. L’audit opt-in ajoute le parcours réel du défilement et les 24 onglets principaux/secondaires des automatisations, opérations, communications, paramètres et catalogue, ainsi que la modale produit (validation requise et annulation). Ces captures sont des preuves à relire, pas une note de perfection automatique.

### Priorités suivantes issues de la critique

1. Composeur e-mail et modèles : rédaction riche, brouillons, CC/CCI/pièces et gestion explicite des HTML importés sans conversion destructrice. Le champ HTML actuel reste trop technique.
2. Listes métier sur téléphone : colonnes prioritaires/cartes de lecture, actions accessibles sans parcourir un grand tableau ; généraliser recherche/pagination serveur avant la recette gros volumes.
3. Studios séquences/workflows : lecture du chemin, brouillon/publié, erreurs contextualisées et retours après annulation ; vérifier les scénarios avec données, pas uniquement une bibliothèque vide.
4. Fiches, Service et Opérations : terminer la traduction des codes métier visibles et réduire les configurations permanentes ; tester les états en retard, non affectés, sans données et avec beaucoup de dossiers.
5. Documents : relire devis, facture, contrat, avenant et rapports multipages en PDF réel, avec données longues, remises/TVA multiples, signature et pied de page ; ne pas confondre aperçu écran et PDF.

Les capacités fonctionnelles restant partielles sont suivies dans [la matrice de couverture](coverage-and-external-dependencies.md) et [le plan de complétude](next-completeness-execution-plan.md). Cette passe UI ne les marque pas comme terminées.
