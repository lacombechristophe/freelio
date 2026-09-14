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

## Repères externes consultés

La [documentation HubSpot des listes et vues](https://knowledge.hubspot.com/records/view-and-filter-records), mise à jour le 11 août 2026, confirme l’importance des vues enregistrées, des filtres et de la personnalisation des tableaux. Le repère retenu ici est la rapidité pour retrouver un portefeuille de travail, pas l’accumulation de commandes visibles. La [présentation officielle Extrabat Piscine](https://www.extrabat.com/piscine/) sert de comparaison pour la continuité du dossier entre relation client, devis, chantier, planning et SAV. Ces sources publiques ne remplacent pas une recette dans les comptes réels de Xavier ; aucune parité exhaustive n’en est déduite.

## Barème de décision

- **Bloquant** : action impossible, données perdues, mauvaise information métier, bouton inaccessible.
- **Majeur** : tâche principale cachée, état vide coupé, navigation ambiguë, vocabulaire incompréhensible.
- **Finition** : alignement, densité, rythme, contenu redondant sans blocage.
- Une surface ne passe à « validée » qu’avec la route, le viewport, l’état testé et une preuve après correction. Un test automatique vert ne transforme pas un état non inspecté en état validé.

## Recette à terminer par famille de parcours

| Famille | États et interactions à éprouver | Critère d’acceptation |
|---|---|---|
| Navigation et listes | Destination active, recherche combinée aux filtres, vue sauvegardée, retour navigateur, liste vide/remplie/longue, tri, sélection et dernière colonne mobile | Un seul emplacement actif ; filtres restitués ; action du dossier accessible ; aucune suppression de sélection silencieuse |
| Fiches CRM et dossiers métier | Coordonnées longues, données absentes, activité récente, propriétaire absent, pièces jointes, erreurs et permissions réduites | Identité, état et prochaine action identifiables ; absence de donnée distinguée de zéro ; action interdite non proposée et refusée côté serveur |
| Création et édition | Première saisie, validation requise, soumission lente, double clic, échec serveur, annulation, navigation avec saisie non enregistrée | Saisie conservée en cas d’échec ; erreurs proches du champ ; focus cohérent ; pas de création ou envoi en double |
| Communications et marketing | Boîte vide/remplie, fil long, réponse, modèle HTML importé, rendu isolé, intégration absente/expirée, désinscription | Destinataire et mode d’envoi explicites ; pas d’envoi involontaire ; ni modification destructive du HTML ni promesse de tracking non disponible |
| Automatisations | Bibliothèque, séquence avec plusieurs étapes, brouillon/publié, inscription exclue, exécution en erreur, reprise et simulation | Déclencheur, audience, chemin et effet lisibles ; publication explicite ; simulation sans effet ; motif d’exclusion et reprise documentés |
| Opérations et SAV | Équipe non affectée, conflit de planning, stock insuffisant, livraison partielle, intervention hors ligne, ticket en retard/clos | Blocage expliqué sans perte de saisie ; stock et transitions cohérents ; synchronisation rejouable ; SLA clairement distingué de l’âge du ticket |
| Finance et documents | Devis → commande → acompte → solde, avoir, TVA/remises mixtes, données longues et plusieurs pages PDF | Montants identiques entre écran, données et PDF ; pas de pied de page coupé ; émission/verrouillage et preuve distincts d’un simple aperçu |
| Configuration et données | Profil incomplet, membre limité, fournisseur non configuré, OAuth refusé/révoqué, import simulé/partiel/échoué | Secret jamais exposé ; état réel du fournisseur affiché ; changement réversible lorsque possible ; rapport d’erreur exploitable |

Pour chaque famille : vérifier ordinateur, téléphone, zoom 200 %, clavier seul, focus visible, chargement, erreur et état vide. Les tableaux horizontalement défilants, les zones internes imbriquées et les menus ouverts doivent être inspectés séparément : les captures verticales ajoutées ne prouvent pas ces états. Contraste, intitulés accessibles et cibles tactiles sont contrôlés automatiquement, puis relus dans le rendu réel.

La recette de volume doit être distincte des fixtures minimales : pagination côté serveur, recherche, tris et affichage avec un portefeuille représentatif ; mesure des temps de réponse et absence de chargement de toute la base dans le navigateur. Aucune promesse de rapidité en production ne découle du seul build local. Les accès fournisseurs, les imports historiques et les obligations documentaires restent des étapes de validation métier/externe, pas des cases UI.

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

## Reprise du 13 septembre — harmonisation et recette réelle

Critère demandé : chaque écran doit être harmonieux, moderne et intuitif. Il se traduit ici par une tâche principale identifiable, des libellés métier compréhensibles, des synthèses compactes, une navigation accessible et une cohérence entre listes, fiches et formulaires. Pas d’indicateurs décoratifs ni de données inventées pour remplir les maquettes.

### Évidence et limites

La CI `33928214521` du commit `dbc4d1c` a été interrompue par sa limite de 25 minutes : elle n’est **pas validée**. Types, lint, build, 286 tests unitaires et intégration PostgreSQL avaient passé. Les audits automatiques ont parcouru 80 routes en bureau et 80 en mobile, sans anomalie P0–P3 détectée par leurs règles. Cela ne prouve ni l’exhaustivité fonctionnelle, ni la qualité visuelle de tous les états.

Les premiers écrans de ces 160 captures ont été relus en planches comparatives. Les défilements, menus, formulaires ouverts et erreurs nécessitent des preuves distinctes. Les nouveaux parcours des 24 onglets Automatisations, Opérations, Communications, Paramètres et Catalogue ont terminé sur les deux formats, avec contrôle de la modale produit (champs requis et annulation). Résultat local ciblé : **4 tests réussis**, preuves dans `test-results/task-usability/`, exécution `tmp/ux-resume-tests-6/`.

### Défauts corrigés pendant la recette

- Onglets mobiles : le centrage d’une barre débordante rendait son premier onglet inaccessible. Alignement au début dans le composant partagé ; les sept onglets des opérations sont désormais actionnables.
- Menu mobile : utilisation de la primitive de dialogue existante pour contenir le focus, fermer par Échap et restituer le focus au déclencheur ; contrôle au clavier et après navigation.
- Favoris : un bouton invisible ne doit pas intercepter les clics ; affichage au survol, au focus et sur périphérique tactile.
- Vues enregistrées : restitution du focus après fermeture du formulaire de nommage.
- Fiches client/devis/facture : synthèse commune compacte ; activité client avant propriétés personnalisées ; statuts de facture lisibles en français ; numéro de facture non comprimé par ses badges.
- Tests : ciblage du formulaire SAV réel, des panneaux d’onglets nommés et du contenu d’aperçu HTML ; suppression de l’attente réseau globale qui bloquait sur les modèles d’e-mail. Attente explicite de l’hydratation avant interaction, sans délai arbitraire.

### Prochaines corrections, classées par impact sur la tâche

| Priorité | Surfaces | Défaut constaté | Vérification attendue |
|---|---|---|---|
| Majeure | Contrats et studio documents | Contrôle heuristique trop dominant ; présentation pouvant être confondue avec une validation contractuelle | Document et prochaine action avant détail des contrôles ; distinction brouillon/signé ; PDF long relu |
| Majeure | Diagnostics, macros, satisfaction, agences | Création/configuration permanente avant la bibliothèque ou la liste, particulièrement sur téléphone | Consulter un élément existant sans traverser le formulaire ; création explicite à la demande |
| Majeure | Clients, factures, prestations, récurrences | Tableaux riches difficiles à parcourir au téléphone | Identité, état, montant et action accessibles ; colonnes secondaires dépliables ou défilement signalé |
| Majeure | Séquences, modèles et workflows | Bibliothèque empilée avant détail sur mobile ; édition HTML encore technique | Sélection → détail → retour avec focus ; brouillon et publication distincts ; aperçu fidèle |
| Majeure | Fiches équipement/intervention/client et inscriptions | Codes `ACTIVE`, `COVER`, `INSTALLATION`, `CONSENT_WITHDRAWN` encore visibles selon les champs | Traductions métier centralisées, sans masquer les états inconnus ; tests des motifs d’arrêt |
| Finition | Organisation, scoring, propriétés, automatisations | Résumés encore trop hauts ou redondants | La première tâche arrive plus tôt, sans supprimer les chiffres ni rendre les montants illisibles |
| Finition | Ensemble | Alignements et densité des formulaires ; états longs/vides rarement représentés dans les maquettes | Relecture par état en bureau/mobile, zoom 200 %, clavier, erreurs et permissions réduites |

Ne pas marquer ces lignes comme terminées sur la base d’un seul changement global de CSS. Chaque correction doit garder les données métier, être testée, puis relue dans le navigateur. Les validations externes et la bascule depuis HubSpot/Extrabat restent celles de la matrice de couverture.

### Recette du lot navigation, fiches et modèles

Le 13 septembre, la recette `task-usability.spec.ts` a terminé : **20 tests réussis, 2 exclusions par format** (favoris bureau / menu mobile). Elle comprend les 24 onglets, le défilement réel, les synthèses des fiches et un doublon de modèle d’e-mail reproduit puis corrigé sans perdre la saisie. Sortie : `tmp/ux-final-20260913/`. Les captures finales des synthèses ont été relues en bureau et mobile.

Le doublon provoquait auparavant une erreur serveur non exploitable. Création et renommage renvoient désormais une erreur métier ; les pannes techniques restent distinctes. Six tests unitaires ciblent succès, conflits, propriété du modèle et refus d’accès. `npm run verify` a réussi : types, lint, **292 tests unitaires / 71 fichiers** et build optimisé. Le résultat de la prochaine CI doit être consigné séparément ; cette recette locale ne valide pas encore les parcours critiques complets en production.

### Lot documents et dépendances — 13 septembre

- Bloc commun de vérifications sur devis, factures et contrats : pas de score /100 ni de promesse « prêt à envoyer/signature ». Contrôles indicatifs explicitement distingués d’une validation juridique ou fiscale. Tous les diagnostics restent disponibles ; les erreurs ouvrent le détail, les conseils seuls restent repliés.
- Une vigilance suffit désormais à demander une relecture, même lorsque l’ancien score dépassait 86. Les quantités invalides sont signalées par l’évaluation, sans rendre le moteur financier permissif.
- Mise en page à la demande ; aperçu avant le suivi de commande dans le devis ; liens de téléchargement sans bouton interactif imbriqué. Le PDF final doit toujours être relu, particulièrement sa pagination.
- La CI `34771720937` a échoué sur six dépendances signalées par l’audit, avant les E2E ; PostgreSQL a passé. Mises à jour ciblées : Vitest/coverage 4.1.11, Sharp 0.35.4, js-yaml 4.3.2 et Hono 4.13.7. `npm audit --audit-level=moderate` : **0 vulnérabilité déclarée**. Aucun seuil d’audit réduit.
- Après mise à jour, `npm run verify` a réussi avec 294 tests et build optimisé ; la couverture relancée seule sur base locale isolée a passé (80,49 % instructions, 55,21 % branches, 83,18 % fonctions, 84,08 % lignes sur le périmètre critique configuré). La première tentative de couverture, simultanée à la vérification, a échoué sur des délais ; elle n’est pas présentée comme réussie.

Références de sécurité : [Vitest](https://github.com/advisories/GHSA-82fw-gwwq-j7x9), [Sharp](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), [js-yaml](https://github.com/advisories/GHSA-2883-xcg3-v3hh), [Hono](https://github.com/advisories/GHSA-gqvv-2mrq-wpjv). Les recettes finales après les dernières corrections et la CI du commit candidat restent à consigner.

La recette UX élargie a terminé : **22 réussites et 2 exclusions par format** (`tmp/ux-final-documents-20260913/`). La relecture des captures a cependant révélé un chevauchement dans l’aperçu A4 mobile que le test du cadre extérieur ne détectait pas. Le studio affiche maintenant une page de largeur A4 fixe, réduite proportionnellement avec la taille réelle de son conteneur, au lieu de comprimer les colonnes en millimètres. Le test vérifie la largeur interne, les limites des cellules, les options du téléchargement et le chargement des polices. Nouvelle recette ciblée : **2 tests réussis**, captures bureau/mobile relues (`tmp/ux-scaled-documents-20260913/`). Cette correction porte sur l’aperçu écran ; elle ne remplace toujours pas la recette PDF multipages.

Validation finale locale du lot documentaire : `npm run verify` réussi avec **298 tests / 71 fichiers**, types, lint et build optimisé. La CI `34772384047` du lot précédent (`8429fd5`) a terminé avec succès : **48 tests navigateur et 18 exclusions**, PostgreSQL, build, couverture et audit. Une nouvelle CI est requise pour le commit documentaire ; aucun déploiement de ces modifications n’a encore été effectué manuellement.

### Pagination réelle des documents — 13 septembre

La CI du commit documentaire `7cf1e80` (`34772977364`) est désormais réussie, y compris les deux jobs qualité/E2E et PostgreSQL.

La génération de documents longs a ensuite révélé un défaut distinct de l’aperçu : marges non répétées après la première page, avec risque de collision avec les mentions fixes. Correction ciblée commune aux devis, factures et contrats : marges d’impression répétées, référence et pagination dans la zone de marge native de Chromium ; mentions complètes conservées dans le flux à la fin du document, sans superposition. Les références sont échappées dans le contexte CSS et la préférence de masquage de référence est respectée.

Recette visuelle : **19 pages relues**, devis et facture de 64 lignes (6 pages chacun), contrat de 28 articles (7 pages). Les prestations 01 à 64, le total attendu de 12 047,27 €, les blocs d’acceptation/signature et les mentions finales restent présents. Aucun chevauchement observé sur ces cas. Captures locales : `tmp/pdf-review-20260913/*-review-*.png`.

Recette reproductible sans données client ni base : `npx tsx scripts/verify-document-pagination.ts`. Elle génère les trois documents longs et neuf devis courts (trois modèles × trois densités), vérifie les dimensions A4 et le nombre de pages court/multipage, puis conserve les PDF dans `tmp/document-pagination/`. Ces assertions ne remplacent pas leur inspection visuelle. Sept tests unitaires couvrent les marges, références, échappement CSS et intégration des modèles. Les autres lignes de la revue restent ouvertes ; cette correction n’atteste pas une conformité juridique ou une parité produit.

Référence technique : [zones de marge d’impression de Chromium](https://developer.chrome.com/blog/print-margins?hl=fr).

### Bibliothèques SAV et aides contextuelles — 13 septembre

La CI `34773970182` du correctif PDF `45ec925` a terminé avec succès. Le lot suivant porte sur deux bibliothèques : macros de réponse et guides de diagnostic. Le formulaire est accessible à la demande, sans démontage des champs lorsqu’on le replie ; la bibliothèque devient consultable au premier écran en bureau et mobile. L’attente de l’enregistrement couvre maintenant toute la promesse serveur ; le formulaire est réinitialisé uniquement après succès.

La relecture a également révélé un défaut partagé : les styles `group-focus-within` des aides étaient activés par des ancêtres sans rapport avec leur bouton ; les infobulles pouvaient être coupées par les cartes. La primitive Tooltip déjà installée assure maintenant le positionnement hors des cartes, les collisions avec le bord de l’écran, le focus/survol et la fermeture par Échap. Le toucher ouvre l’aide ; la description est reliée explicitement au bouton. Les tests couvrent l’absence d’ouverture sur un champ voisin et les limites de l’infobulle, avec une tolérance géométrique d’un pixel pour les coordonnées fractionnaires mobiles.

Les premières recettes ont échoué sur la sémantique manquante du nouveau popup, puis sur une égalité de ratio d’intersection trop stricte (`0.999999821` au lieu de `1`) ; ces défauts ont été corrigés avant la recette complète. Une erreur transitoire de manifeste JSON du serveur de développement pendant le rechargement a également été observée ; elle ne justifie pas de relâcher les contrôles d’hydratation. Résultats complets et CI du nouveau lot à consigner. Captures : `test-results/task-usability/{desktop,mobile}/{macros,diagnostics}-{library,creation}*.jpg`.

Les pages Agences et Satisfaction, la navigation maître-détail mobile et les traductions des autres domaines restent ouvertes. L’amélioration de ces deux bibliothèques ne clôt pas la ligne entière du plan.

Reprise du 14 septembre : types, lint et **305 tests unitaires / 72 fichiers** réussis sur base locale isolée. Les deux nouveaux parcours SAV/aides ont passé sur bureau et mobile lors de la recette élargie ; celle-ci n’est toutefois pas entièrement verte (échecs documentaires, dont une compilation à froid de fiche facture de 22 secondes et une attente d’hydratation). La cause de chaque échec ne doit pas être attribuée automatiquement à l’infrastructure. Nouvelle validation du build et des parcours documentaires requise avant déploiement ; aucun nouveau déploiement annoncé.

La nouvelle exécution isolée de `npm run verify` a terminé avec un code de sortie 0 : types, lint, 305 tests et build optimisé, 73 pages statiques générées. La validation des parcours complets en CI reste requise pour ce candidat ; le succès du build seul ne clôt pas les échecs navigateur précédents.

### Satisfaction — 14 septembre

La CI `34793020813` de `9c03179` a terminé avec succès : 305 tests unitaires, 54 tests navigateur réussis et 18 exclusions ; le job PostgreSQL a également passé. Ce résultat concerne le lot précédent, pas les modifications ci-dessous.

- Historique des réponses avant la bibliothèque des enquêtes ; les formulaires sont accessibles à la demande et conservent les saisies lorsqu’ils sont repliés.
- Suppression de la moyenne mélangeant CSAT, NPS et CES : nombre d’enquêtes actives à la place, et indication explicite de la fenêtre de 200 invitations maximum.
- Génération désactivée sans enquête active ; réinitialisation des contacts et tickets lors du changement de client ; attente couvrant la promesse serveur entière.
- Types et lint ciblé réussis, quatre tests unitaires des métriques réussis, deux parcours Satisfaction bureau/mobile réussis. Captures relues dans `test-results/task-usability/{desktop,mobile}/satisfaction-results*.jpg` ; le test contrôle également la conservation du brouillon et le défilement complet.

La première exécution a révélé des retours de promesses incompatibles avec les transitions React, corrigés avant validation. Le sélecteur du test utilise maintenant le rôle accessible `combobox`, au lieu du texte intégral du label contenant les options. Les deux parcours documentaires locaux supplémentaires ont échoué à atteindre certaines fiches (restés sur les listes lors de l’assertion) ; ces échecs sont conservés, malgré le succès des mêmes parcours dans la CI précédente. Nouvelle CI requise avant déploiement.

Restent notamment Agences, les parcours maître-détail mobile, les libellés métier et la recette des états longs/vides. La revue du service Satisfaction révèle aussi un point de confidentialité à traiter : masquer uniquement le nom dans les réponses dites anonymes ne retire pas leurs identifiants de rattachement du payload serveur. Ce lot d’interface ne valide donc pas l’anonymisation ni la complétude fonctionnelle du module.

Correctif de confidentialité consécutif : la projection des réponses utilise désormais une liste explicite de champs, sans clés de rattachement brutes, hash du jeton ni métadonnées. Pour les enquêtes anonymes, l’identifiant du client est nul et les relations contact/ticket sont absentes. Quatre tests ciblent le payload sérialisé anonyme, les relations nominatives autorisées, le filtrage par entreprise et le refus d’accès. Cela masque les rattachements dans cette vue, sans effacer les données de la base ni anonymiser automatiquement les informations que le répondant écrit dans son commentaire. Les exports et autres surfaces exigent une recette distincte.

Validation locale après ce correctif : `npm run verify` terminé avec succès (types, lint global, **309 tests / 73 fichiers**, build optimisé). La CI du lot UI `4b78ad8` est en cours sous `34805712447` ; une nouvelle CI couvrira le correctif de confidentialité. Aucun déploiement de production effectué dans cette reprise.
