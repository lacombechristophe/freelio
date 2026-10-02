# Freelio — Plan de refonte UI/UX

Date : 28 septembre 2026. Statut : proposition de référence pour la réalisation.

## 1. Décision de design et objectif

Freelio doit devenir un outil de travail clair, calme et précis, dans lequel on repère immédiatement un client, une prochaine action, un statut et un montant. La qualité recherchée vient de la hiérarchie, des alignements, de la densité et de la stabilité des interactions.

Direction confirmée par le demandeur : **interface claire, gris neutres, bleu franc discret ; priorité aux clients, au pipeline, aux devis et aux factures**. Les trois captures Cloudflare fournies servent de références pour l'organisation et la qualité d'exécution. L'identité, les contenus et les parcours restent propres à Freelio.

Contexte de conception : un professionnel gère plusieurs dossiers au bureau, en lumière ambiante, passe régulièrement de la relation client au devis et cherche à avancer rapidement. La version claire est le point de départ ; le téléphone doit permettre de retrouver un dossier et d'agir sans traverser une interface de bureau comprimée.

Livrable de cette étape : un plan de refonte globale, avec règles visuelles, parcours, composants, ordre de migration et critères de recette. La réalisation des écrans sera le lot suivant.

## 2. Base de l'audit et limites

L'analyse porte sur le code présent dans le dépôt, les trois références fournies et trois captures historiques Freelio inspectées : Clients, Pipeline et Satisfaction. Les captures Clients/Pipeline sont archivées dans `tmp/ci-ui-review-33928214521/full-ui-audit/desktop/` (fichiers datés du 13 septembre) ; Satisfaction dans `test-results/task-usability/desktop/` (14 septembre). Elles servent à illustrer les structures retrouvées dans le code. Elles ne constituent pas une vérification visuelle de l'application actuelle en production.

Inventaire constaté : **67 fichiers `page.tsx` sous `src/app/dashboard`**, incluant pages dynamiques et éditeurs ; 87 dans l'ensemble de `src/app`. Un nombre de fichiers n'est pas un nombre exhaustif d'états : onglets, permissions, chargements et données multiplient les situations à couvrir.

Sources locales principales :

- `src/app/globals.css`, `src/components/layout/{shell,sidebar,mobile-sidebar,dashboard-navigation,dashboard-navigation-menu,quick-create-menu}.tsx` ou `.ts`.
- `src/components/ui/`, `src/components/shared/{page-header,record-summary,saved-view-bar,document-studio,empty-state}.tsx`.
- Listes Clients, Devis et Factures ; fiche client ; tableau Pipeline ; composants `workspace-hub` et `workspace-insights`.
- Actions de lecture Clients, Devis et Factures ; configuration shadcn ; revue UI/UX antérieure et suites Playwright existantes.

Pas de campagne de tests ni de nouvelle navigation authentifiée exécutée pour ce plan. Les guides CSS et layouts de la version locale de Next.js ont été consultés. Les modifications déjà présentes dans le dépôt appartiennent aux travaux en cours et ne font pas partie de cette proposition.

## 3. Diagnostic concret

| Priorité | Constat vérifié | Effet sur l'usage | Décision |
|---|---|---|---|
| Haute | Navigation avec dégradé bleu nuit codé en dur, sélection cyan, fond principal bleuté | La navigation attire davantage l'œil que le dossier en cours | Navigation claire, sélection neutre ou bleu très pâle, texte fortement lisible |
| Haute | Couleurs réparties entre variables globales, classes locales et règles `.workspace-page` | Les changements de thème produisent des exceptions et des incohérences | Un vocabulaire de couleurs sémantiques partagé par tous les composants |
| Haute | Recherche, vues, filtres, tri et actions répartis dans plusieurs blocs sur les listes | La zone de contrôle prend de la hauteur et change selon le module | Gabarit de liste commun, commandes regroupées au contact des résultats |
| Haute | Le bouton global « Créer » et l'action locale sont tous deux bleus | Deux priorités visuelles concurrentes | « Créer » global secondaire ; action principale liée à la page |
| Haute | Huit groupes métier dans la navigation et plusieurs accès au même écran | Effort pour comprendre où retrouver une fonction | Six domaines lisibles, destinations canoniques, favoris conservés |
| Haute | Fiche client composée d'une succession de sections, propriétés, portail et tableaux | Les informations utiles à une tâche sont dispersées dans une longue page | En-tête stable, synthèse brève, onglets métier et activité centrale |
| Haute | Clients chargés par lot de 100 ; devis et factures par lot de 50 ; filtres locaux sur ces tableaux | Un résultat absent peut appartenir à une autre tranche ; les compteurs peuvent être partiels | Dépendance explicite de pagination/recherche serveur, portée des totaux documentée |
| Moyenne | Montant « En attente » des factures calculé à partir du lot reçu | Le montant visible peut être interprété comme un encours global | Agrégat calculé sur le périmètre annoncé ; libellé provisoire explicite tant que partiel |
| Moyenne | Table primitive à largeur minimale de 680 px ; cellules non sécables | Consultation mobile dépendante du défilement horizontal | Colonnes essentielles ou présentation mobile propre, défilement local pour données complexes |
| Moyenne | Nombreux blocs arrondis, métriques, icônes teintées et descriptions de page | Tout paraît avoir un poids similaire | Structure par titres et séparateurs ; couleur réservée aux actions et aux états utiles |
| Moyenne | Texte secondaire forcé à `#526680` dans `.app-surface`, y compris sous un thème sombre | Risque de contraste malgré les variables `.dark` | Supprimer les couleurs qui contournent le thème ; vérifier chaque paire de couleurs |
| Moyenne | Barre de défilement du pipeline masquée | Étendue du tableau moins évidente, même avec les flèches existantes | Indication de débordement, commandes conservées, accès mobile par étape |

À conserver : recherche globale, favoris, vues enregistrées déjà disponibles, permissions serveur, états vides contextualisés, synthèse `RecordSummary`, primitives accessibles, parcours métier et outils de tests. La revue du 5 septembre contient aussi des améliorations et des limites utiles ; ses résultats passés ne valent pas validation du nouveau design.

## 4. Ce que l'on reprend des références Cloudflare

| Référence | Qualité observée | Traduction dans Freelio |
|---|---|---|
| Capture 1 — DNS | Outils proches des données, lignes régulières, séparation fine des colonnes, action primaire identifiable | Listes Clients/Devis/Factures avec barre d'outils commune, montants alignés, tri explicite et actions de ligne discrètes |
| Capture 2 — Overview | Navigation hiérarchique, sections titrées, filtres cohérents, synthèse compartimentée | Cockpits métier courts, sections compréhensibles, filtres persistants, indicateurs regroupés |
| Capture 3 — fiche domaine | En-tête identifiable, contenu principal et informations contextuelles latérales | Fiche client et fiche document : identité, activité/document au centre, coordonnées ou métadonnées à droite |

L'emplacement exact des blocs, la marque orange, les pictogrammes propriétaires, les textes et les détails décoratifs ne sont pas repris. Les motifs génériques — navigation latérale, tableaux, onglets, boutons, menus, accordéons — sont adaptés au CRM. Les captures ne permettent pas d'identifier la bibliothèque utilisée par Cloudflare.

Adaptations nécessaires : raccourcir les grandes zones vides pour un travail quotidien dense, garder des textes secondaires plus contrastés, prévoir réellement le mobile et éviter de multiplier les panneaux d'information sans action utile.

## 5. Système visuel cible

### Palette claire

| Rôle | Proposition | Usage |
|---|---|---|
| Toile | `#FAFAFA` | Fond de travail neutre |
| Surface | `#FFFFFF` | Tableaux, formulaires, panneaux |
| Surface secondaire | `#F5F5F5` | Navigation, en-têtes légers, survol neutre |
| Texte principal | `#171717` | Titres, noms, données importantes |
| Texte secondaire | `#5C5C5C` | Aides, métadonnées, espaces réservés |
| Séparateur | `#E5E5E5` | Séparation décorative des sections et lignes |
| Contour de contrôle | `#8A8A8A` | Identification des champs lorsque le contour est nécessaire |
| Action / lien / focus | `#1463E5` | Action primaire, lien, focus clavier |
| Action au survol | `#0F51BE` | Bouton primaire survolé |
| Sélection | `#EFF6FF` | Fond des éléments sélectionnés |
| Succès | `#166534` sur `#F0FDF4` | Devis accepté, facture payée |
| Attention | `#92400E` sur `#FFFBEB` | Échéance proche, information à vérifier |
| Erreur / urgence | `#B91C1C` sur `#FEF2F2` | Erreur, impayé en retard, action destructive |

Contrastes calculés pour les couleurs opaques proposées : texte principal/blanc 17,93:1 ; secondaire/toile 6,41:1 ; blanc/bleu 5,32:1 ; bleu/sélection 4,89:1 ; contour/blanc 3,45:1 ; textes de statut/fonds associés ≥ 5,91:1. Ces calculs ne remplacent pas les contrôles du rendu, des opacités et des états interactifs.

Le séparateur léger n'est pas le seul indice d'un contrôle interactif. Les états conservent un libellé et, si utile, une icône : aucune signification uniquement par couleur. Les séries de graphiques ont une palette distincte, avec légendes et motifs si nécessaire.

Le bleu occupe peu de surface. Les montants sont en texte principal ; rouge seulement lorsqu'ils signalent réellement un problème. Les badges neutres restent majoritaires. La personnalisation de l'entreprise reste dans le nom, le logo et les documents ; une couleur cliente ne recolore pas automatiquement tous les contrôles du CRM.

Le mode sombre existe : prévoir ses équivalents dès la définition des tokens et le recetter pour chaque composant migré. La validation visuelle commence en clair, sans laisser les couleurs fixes du thème clair se propager en sombre.

### Typographie, densité et géométrie

- Garder **Geist Sans**, déjà chargée. Une seule famille dans l'interface métier ; chiffres tabulaires pour montants, dates et compteurs. Monospace réservé aux identifiants qui le justifient.
- Titre de page 28 px/34 px, titre de section 16 px/24 px, texte courant et commandes 14 px/20 px, métadonnées 12–13 px avec contraste suffisant. Champs à 16 px sur téléphone.
- Échelle d'espacement : 4, 8, 12, 16, 24, 32 px. Marge principale de 24–32 px au bureau et 16 px sur téléphone.
- Navigation ouverte 240 px ; barre supérieure 56 px. Mode réduit conservé seulement s'il reste compréhensible au clavier et au toucher.
- Contrôles 36–40 px au bureau ; cibles tactiles de 44 px. Lignes de tableau 44 px en densité compacte et 52 px en densité confortable.
- Rayons : contrôles 6 px, panneaux/tableaux 8 px, fenêtres 10–12 px. Étiquettes en pilule uniquement lorsque leur rôle le justifie.
- Panneaux délimités par une bordure fine ; ombre courte pour les menus et fenêtres superposés. Fond opaque de la barre supérieure.
- Tableaux et pipeline utilisent la largeur disponible ; vues de synthèse plafonnées autour de 1 440 px ; formulaires courants autour de 880 px, éditeurs commerciaux plus larges si nécessaire.
- Transitions courtes de 150–200 ms pour changement d'état. Chargement immédiatement lisible ; réduction des mouvements respectée.

### Règles de composition

Un titre, une action principale, une zone de commandes et le contenu utile. Les descriptions expliquent une règle ou une ambiguïté ; les phrases qui répètent simplement le titre sont supprimées. Une section est créée par sa fonction, pas automatiquement par une carte.

Les métriques sont regroupées en une bande compacte quand elles aident une décision. Les cockpits privilégient les actions à traiter, puis les indicateurs et l'activité. Les écrans transactionnels commencent par la transaction.

## 6. Navigation et architecture de l'information

La structure cible conserve les URL et les accès profonds existants. Une fonction possède un emplacement principal ; les favoris constituent des raccourcis explicites.

| Groupe | Contenu principal | Correspondance existante |
|---|---|---|
| Clients et ventes | Clients, contacts, prospects, communications, pipeline, devis, contrats, catalogue | `/clients`, `/contacts`, `/leads`, `/communications`, `/pipeline`, `/devis`, `/contrats`, `/catalogue` |
| Facturation | Factures, récurrences, temps non facturé, dépenses, banque, comptabilité | `/factures`, `/depenses`, `/comptabilite` et leurs sous-pages |
| Opérations | Chantiers, planning, achats, fournisseurs, stocks, terrain, temps | `/projets`, `/organisation`, `/operations` et ses onglets/sous-pages, `/terrain`, `/temps` |
| Service | Support, parc installé, entretien, diagnostics, macros, connaissance, satisfaction, portefeuille clients | `/service` et ses sous-pages ; onglets métier existants de `/operations` |
| Marketing | Campagnes, segments, scoring, automatisations | `/marketing`, `/campagnes`, `/automatisations` |
| Rapports | Tableaux de bord et analyses transverses | `/reports`, accès contextuels aux analyses métier |

Les chemins de ce tableau sont relatifs à `/dashboard`. Vue d'ensemble et favoris restent au-dessus des groupes. Paramètres, équipe, agences, données, migration, intégrations, abonnement et aide sont rassemblés dans une zone Administration repliable. Notifications restent disponibles dans l'en-tête.

Les vues `/crm`, `/sales`, `/revenue`, `/operations`, `/service`, `/marketing/overview` et `/data` sont conservées comme synthèses de leurs domaines, avec un intitulé cohérent. Elles ne doivent pas être des passages obligatoires pour atteindre une liste.

Organisation reste une destination canonique pour agenda/tâches ; le planning d'interventions garde son contexte métier. Les raccourcis « Rendez-vous », « Objectifs », « Prévisions » et « Exports » doivent annoncer clairement leur destination ou le filtre appliqué. Ne pas créer d'écrans distincts artificiels derrière des labels différents.

La marque d'entreprise est visible dans l'en-tête de navigation. Afficher un sélecteur d'entreprise seulement si le changement d'espace est réellement disponible et autorisé. L'état actif, les favoris, les liens avec paramètres et les droits sont testés ensemble. Un menu filtré par permission reste complété par les contrôles serveur.

## 7. Gabarits et parcours prioritaires

### A. Listes — Clients comme écran pilote

Ordre vertical cible :

1. Titre « Clients », compteur dont la portée est exacte, action « Ajouter un client ».
2. Vues enregistrées compactes : nom de vue, indication de modification, commande d'enregistrement secondaire.
3. Une barre de recherche, Filtres, Colonnes et menu d'actions. Le tri principal est disponible dans l'en-tête des colonnes ; les filtres actifs apparaissent sous forme de libellés supprimables.
4. Tableau : identité et contact principal, type, prochaine action si disponible, encours, autres propriétés à la demande ; menu de ligne à droite.
5. Nombre de résultats, taille du lot et navigation entre lots.

La recherche globale trouve un dossier dans l'application. La recherche de liste agit sur le type de dossier affiché. Leurs libellés expliquent cette différence. Retour depuis une fiche : filtres, tri et position de la liste retrouvés.

Éviter de comprimer les noms et les montants. Une information tronquée est consultable au clavier et au toucher. Les liens ouvrant une fiche restent de vrais liens. La sélection multiple fait apparaître des actions pertinentes et annonce si elle porte sur la page ou sur tous les résultats.

**Dépendance fonctionnelle du lot** : recherche, filtres, tri, pagination, compteurs et exports doivent s'accorder sur un même périmètre côté serveur. Le comportement local actuel ne permet pas de promettre une recherche exhaustive. Si cette dépendance n'est pas livrée immédiatement, indiquer « Recherche dans les 100 clients chargés », proposer l'accès aux suivants et éviter tout compteur global trompeur.

Contrat cible à définir avant branchement : requête validée `{recherche, filtres, tri, curseur, taille}`, réponse `{éléments, curseurSuivant, totalFiltré, agrégats}` selon le coût et le besoin. Tri stable avec départage par identifiant ; filtrage par entreprise et droits inchangé. Sérialisation d'URL validée et retour navigateur fonctionnel.

Les montants financiers de synthèse utilisent un agrégat dédié, avec périmètre annoncé. Une recherche serveur de facture ne doit pas multiplier les effets de bord de la lecture actuelle (`getInvoices` déclenche aussi du traitement métier) : séparer ou cadrer cette lecture avant d'introduire des requêtes à chaque saisie.

### B. Fiche client — le dossier de référence

- En-tête : nom, type, contact principal, action « Créer un devis », autres actions dans un menu.
- Synthèse courte : prochaine action, encours et information commerciale utile. Une alerte existe seulement si elle demande une attention réelle.
- Onglets : Vue d'ensemble, Activité, Documents, Chantiers et équipements, Informations. Portail client et propriétés personnalisées ont une place identifiable et restent accessibles.
- Bureau : activité et prochaine action dans la colonne principale ; coordonnées, responsable lorsqu'il existe et informations de contexte à droite. Pas de seconde colonne vide sur les petites fiches.
- Téléphone : identité puis prochaine action, contenu de l'onglet, informations secondaires accessibles à la demande.
- Action rapide en fenêtre ou panneau uniquement pour une opération courte ; édition longue en page. Une erreur conserve la saisie et ramène au champ concerné.

Parcours de recette : retrouver un client → comprendre sa prochaine action → ajouter une note → préparer un devis avec le client prérempli → revenir à la liste dans son état précédent.

### C. Pipeline — lire et faire progresser les affaires

Barre compacte avec choix du pipeline, responsable, recherche et action « Nouvelle opportunité ». Les totaux restent sobres et indiquent leur base de calcul.

Colonnes avec nom d'étape, nombre d'affaires et montant ; carte avec titre, client, montant, responsable et échéance. Largeur stable d'environ 280–320 px. Les colonnes vides occupent leur rôle sans grand bloc promotionnel répété.

Le déplacement par menu, déjà présent, reste la solution clavier/tactile de référence. Le glisser-déposer peut compléter l'usage au bureau dans un lot optionnel ; aucune action ne doit en dépendre. En cas d'échec, l'affaire reste dans son état réel et un message permet de réessayer. Motif de perte conservé.

Défilement horizontal local identifiable, flèches existantes conservées et testées. Sur téléphone, vue par étape avec sélecteur et liste des affaires ; une éventuelle vue tableau complète reste une option.

### D. Devis et factures — de la liste au document

Les deux listes réemploient le gabarit Clients. Devis : référence, client, objet, statut, montant, validité. Factures : référence, client, statut, TTC, reste à payer, échéance. Les chiffres s'alignent à droite ; un retard combine date, texte et couleur.

La fiche expose référence, client, statut et action correspondant réellement au cycle de vie. Les actions « Marquer envoyé », « Envoyer par e-mail », « Télécharger », « Enregistrer un règlement » et « Annuler » restent distinctes : un changement de statut n'est pas présenté comme un envoi réel.

Pour l'édition : client et objet, lignes, conditions, puis contrôles et aperçu. Sur grand écran, récapitulatif financier à droite ; sur téléphone, total et accès au récapitulatif sans couvrir les champs. Les totaux restent visibles lorsque c'est utile et ne masquent jamais une erreur.

Les réglages de mise en page sont secondaires. Le document A4 conserve ses proportions dans l'aperçu et sa lisibilité via zoom/ouverture. Les états brouillon, document finalisé et signé conservent leurs restrictions. Les contrôles documentaires existants restent explicites et ne changent pas de signification par le nouveau design.

Parcours de recette : créer un devis → enregistrer → prévisualiser → modifier une ligne → convertir selon le parcours existant → consulter la facture → enregistrer un règlement. Tous les montants et statuts doivent rester cohérents.

### E. Vue d'ensemble et modules complémentaires

La page d'accueil présente d'abord les échéances et actions : clients à recontacter, devis à suivre, encaissements attendus. Chaque élément mène au dossier ou à une liste filtrée. Les indicateurs sont regroupés ; période et périmètre sont visibles.

Opérations, SAV, marketing, communications et administration reprennent les mêmes règles, avec des structures adaptées à leur tâche : planning, boîte de réception, bibliothèque et écran de paramètres. Ils ne sont pas forcés dans un tableau unique.

## 8. Composants et choix techniques

Le dépôt utilise déjà Next.js/React, Tailwind v4, **shadcn `base-nova` avec Base UI**, Lucide, React Hook Form et TanStack Table. Conserver cette base évite une migration de primitives qui n'apporterait pas de bénéfice visuel direct.

Les variables sémantiques proposées s'inscrivent dans le [mécanisme de thème shadcn](https://ui.shadcn.com/docs/theming). Le [guide Data Table pour Base UI](https://ui.shadcn.com/docs/components/base/data-table) fournit une base de composition avec TanStack ; les tableaux métier restent adaptés à leurs colonnes et actions.

| Travail | Point d'entrée réel | Livrable |
|---|---|---|
| Tokens et thèmes | `src/app/globals.css` | Surfaces, texte, actions, statuts, focus, espacements et rayons documentés |
| Cadre global | `src/components/layout/` | Navigation, en-tête, recherche et menu mobile cohérents |
| En-têtes et synthèses | `page-header.tsx`, `record-summary.tsx`, `workspace-hub.tsx` | Hiérarchie compacte et action principale unique |
| Primitives | `src/components/ui/` | Boutons, champs, badges, onglets, tableaux, menus, fenêtres, aides |
| Structures de liste | `saved-view-bar.tsx` et tableaux métier | `ListToolbar`, filtres actifs, contrôles de colonnes, pagination, sélection |
| Fiches | `src/app/dashboard/clients/[id]/` puis autres dossiers | `RecordHeader`, navigation de fiche, section d'information et activité |
| États | `empty-state.tsx`, `loading.tsx`, `error.tsx` | Chargement, vide, recherche sans résultat, erreur, droits insuffisants |
| Documents | `document-studio.tsx`, `line-items-editor.tsx`, formulaires commerciaux | Édition et aperçu alignés avec le nouveau système |

Les nouveaux noms de composants sont des propositions. Ne créer une abstraction que lorsque plusieurs usages réels la justifient. Réutiliser les primitives et étendre leur API actuelle sans les régénérer en bloc depuis le CLI shadcn.

Établir une page de référence des composants en environnement de développement, sans données client. Elle montre les états normal, survol, focus, sélection, désactivation, attente et erreur, en clair et sombre. Elle sert de contrat de réalisation.

La séparation serveur/client actuelle reste maîtrisée : interactions dans les composants clients nécessaires, données et autorisations côté serveur. Lire les guides de `node_modules/next/dist/docs/` correspondant au changement avant toute écriture de code, conformément à `AGENTS.md`.

La migration des tokens doit être bornée au produit : marketing et portail public utilisent aussi des primitives partagées. Prévoir leurs contrôles de non-régression à chaque modification de primitive globale. Les modèles PDF conservent leurs règles d'impression et leur identité d'entreprise.

## 9. États, mobile et accessibilité

| Situation | Comportement attendu |
|---|---|
| Premier usage | Explication courte du bénéfice et action adaptée ; pas de métriques factices |
| Liste vide après filtre | Rappel des filtres et commande de réinitialisation ; aucune invitation à recréer des données |
| Chargement initial | Squelette aux dimensions du contenu ; structure de page stable |
| Actualisation | Données existantes conservées si valides, attente discrète, annonce accessible |
| Erreur de lecture | Message contextualisé et nouvelle tentative dans la zone concernée |
| Erreur de formulaire | Texte lié au champ, résumé si plusieurs erreurs, saisie conservée |
| Enregistrement | Action en cours clairement nommée, doubles soumissions empêchées |
| Droits limités | Commandes adaptées aux capacités ; refus compréhensible pour les liens directs |
| Données longues | Noms sur plusieurs lignes si nécessaire, valeurs consultables, montants non tronqués |
| Action destructive | Objet nommé, conséquence précise, confirmation existante conservée |
| Terrain hors ligne | État de synchronisation et action possible explicites, saisie et file locale préservées |

Cible de recette : WCAG 2.2 AA. Contraste du texte courant ≥ 4,5:1 ; indications graphiques essentielles et états de contrôle ≥ 3:1 ; navigation au clavier, focus visible et non masqué, noms accessibles et comportement des fenêtres vérifiés. Référence : [critères et techniques WCAG du W3C](https://www.w3.org/WAI/WCAG22/quickref/). Les cibles de 44 px sur téléphone sont une règle de confort du projet, au-delà du minimum AA général de 24 px sous conditions.

Formats de référence : 1 920, 1 440, 1 280, 1 024, 768, 390 et 360 px. Contrôler le zoom à 200 % et le réagencement à une largeur équivalente à 320 px. Les tableaux et le pipeline peuvent défiler dans leur propre zone ; le contenu principal ne déborde pas horizontalement.

Sous 1 024 px, navigation en panneau à la demande ; priorité à la recherche et au contenu. Les actions secondaires passent dans un menu. Les fenêtres sont dimensionnées pour permettre l'accès au bas du formulaire avec le clavier virtuel ouvert. Gestion du focus et retour au déclencheur obligatoires.

## 10. Feuille de route exécutable

Les charges sont des ordres de grandeur en jours-personne pour conception, intégration et recette de lot. Elles supposent une personne expérimentée, une base de test disponible et un périmètre stabilisé. L'inventaire des états du lot 0 permettra de les réviser.

| Lot | Charge indicative | Livrables | Condition de sortie |
|---|---|---|---|
| 0 — Référence et cadrage | 2–3 j | Matrice routes/états/rôles, captures actuelles, maquettes Clients + fiche client + facture à 1 440 et 390 px | Direction visuelle relue sur des données réalistes ; priorité et dépendances explicites |
| 1 — Fondations | 2–3 j | Tokens clairs/sombres, primitives, page de référence, nomenclature des statuts | Tous les états des composants pilotes cohérents et contrastés |
| 2 — Navigation | 2–3 j | Sidebar claire, en-tête, navigation regroupée, mobile et favoris | Les destinations existantes restent accessibles ; état actif et droits corrects |
| 3 — Listes | 3–5 j | Clients pilote puis listes devis/factures, outils communs, pagination et recherche cohérentes | Un dossier hors du premier lot est retrouvable ; tri/filtre/compteur/export concordent |
| 4 — Dossier client et pipeline | 4–6 j | Fiche client structurée, activité, création contextuelle, pipeline bureau/mobile | Parcours client → affaire → devis réalisable au clavier et au toucher |
| 5 — Parcours commerciaux | 4–6 j | Éditeurs et fiches devis/facture, aperçu, paiements, contrôles | Montants, statuts, permissions, aperçu et PDF vérifiés sur les cas représentatifs |
| 6 — Déclinaison globale | 5–9 j | Cockpits, contacts/prospects, contrats, catalogue, opérations, SAV, marketing, communications, administration | Chaque famille de pages a ses états et sa recette ; aucune ancienne variante non justifiée |
| 7 — Recette transversale | 2–4 j | Régressions visuelles, parcours critiques, clavier/mobile, contrôle des surfaces partagées | Aucun défaut bloquant/majeur sur le périmètre livré ; preuves rattachées au commit |

**Enveloppe initiale : 24–39 jours-personne**, soit environ 5–8 semaines à temps plein pour une personne, hors délais de retours et dépendances nouvelles. Le volume des modules secondaires et la pagination serveur sont les principales incertitudes. Une validation légère de chaque lot précède la recette finale ; les tests ne sont pas repoussés à la dernière semaine.

Ordre de dépendance : cadrage → fondations → navigation → listes → fiches/pipeline → documents → autres modules → recette transverse. Première livraison visuelle cohérente possible après les lots 1 à 3, avec un périmètre annoncé.

### Premier lot de réalisation à préparer

1. Capturer l'état actuel de Clients, fiche client, Pipeline et Factures dans un environnement de test isolé.
2. Produire une maquette détaillée de Clients à 1 440 × 900 et 390 × 844 avec la palette de ce document.
3. Montrer, sur cette même maquette, un filtre actif, une sélection de lignes, un menu, un état vide et un chargement.
4. Vérifier que la première ligne du tableau se situe idéalement avant 280 px à 1 440 × 900, hors alerte métier nécessaire ; c'est une cible de composition à éprouver, pas une mesure actuelle.
5. Faire relire cette référence avant de décliner les 67 pages. Décider alors les détails de densité et d'alignement, sur un écran concret.

## 11. Recette et définition de « terminé »

La refonte est terminée lorsque l'utilisateur retrouve les mêmes conventions d'un module à l'autre et que les tâches essentielles fonctionnent avec les nouvelles structures.

Mesures de référence à prendre au lot 0 puis à comparer : temps pour retrouver un client, nombre d'étapes pour ajouter une note ou démarrer un devis, erreurs et retours arrière pour trouver une facture en retard. Avec 3–5 utilisateurs représentatifs, viser au moins 90 % de réussite sans assistance sur ces tâches et une réduction d'environ 20 % du temps médian de recherche ; ces seuils sont des objectifs à confronter à la mesure initiale, pas des résultats acquis.

Critères de livraison :

- Chaque page migrée utilise les tokens et composants convenus ; les exceptions ont une justification écrite.
- Recherche, filtres, tri, sélection et exports restent cohérents sur 0, 1, 25, plus de 100 et plusieurs milliers de dossiers de test. Pagination côté serveur plutôt qu'un rendu intégral.
- Au moins un scénario couvre un élément absent du premier lot, un nom de plus de 80 caractères, un gros montant, un champ manquant et une erreur réseau.
- Les filtres sont conservés après ouverture d'une fiche et retour ; actualiser et partager une URL conserve le périmètre prévu, sans exposer de données non autorisées.
- Tous les contrôles essentiels sont utilisables au clavier ; aucune information critique seulement au survol ; dates, devises et libellés métier restent en français.
- Les effets réels d'envoi, de paiement, de conversion, de signature et de suppression restent conformes aux parcours existants. Les recettes utilisent des données et services de test.
- Le chargement, l'échec, l'absence de données et les permissions réduites sont relus visuellement, avec la même attention que l'écran rempli.
- Le thème sombre, l'authentification, le portail et les pages marketing ne régressent pas du fait des primitives partagées.
- Aucun contenu utile masqué par un élément fixe ; test du véritable conteneur de défilement `#dashboard-main`, jusqu'en bas de chaque page longue.
- Sur les parcours pilotes, comparer les performances avant/après dans le même environnement ; enquêter sur une hausse répétée de plus de 10 % des temps d'interaction ou de la taille JavaScript. Pas d'ajout de bibliothèque sans besoin identifié.

S'appuyer sur `tests/e2e/visual-direction.spec.ts`, `task-usability.spec.ts`, `full-ui-audit.spec.ts` et `critical-flows.spec.ts`. La suite de direction visuelle actuelle capture des écrans et vérifie des éléments ; elle n'établit pas à elle seule une comparaison d'images de référence. Ajouter des comparaisons ciblées sur les gabarits stables avec données déterministes, en complément de la relecture humaine.

Pour chaque lot : types et lint, tests fonctionnels liés au changement, puis tests navigateur ciblés. Pour le candidat final : vérifications complètes du projet dans une base isolée, puis recette des parcours critiques. Les scripts de préparation et les pages susceptibles de déclencher du traitement métier ne sont pas lancés sur une base partagée pour produire des captures.

Les tests de navigation existants (`dashboard-navigation.test.ts`, `route-titles.test.ts`) doivent évoluer avec la nouvelle structure. Les seuils et assertions ne sont pas affaiblis pour masquer un changement de comportement non désiré.

## 12. Migration, risques et gouvernance

- **Styles globaux** : remplacer progressivement les règles qui doublonnent ou contournent les tokens. Une modification des seules variables ne termine pas la migration d'une page.
- **Surfaces partagées** : vérifier les consommateurs des primitives hors dashboard avant fusion ; borner les réglages propres au CRM.
- **Fonctions métier** : garder calculs, validations, droits et modèle de données stables lorsque la modification est visuelle. Les changements nécessaires à la recherche/pagination sont identifiés dans un lot fonctionnel distinct et testé.
- **Préférences existantes** : préserver favoris et vues enregistrées ; migrer les clés seulement si nécessaire, avec compatibilité des configurations antérieures.
- **Déploiement** : lots petits et réversibles ; validation visuelle par lot ; historique de captures et commit de référence. Pour un lot de lecture serveur, conserver une compatibilité permettant le retour à l'interface précédente.
- **Travaux simultanés** : coordonner les modifications de fichiers déjà touchés, notamment migrations et génération documentaire. Ne pas écraser les changements en cours.
- **Responsabilités** : responsable produit pour les parcours/priorités ; designer ou développeur référent pour les gabarits ; développement pour les composants et données ; recette métier pour les cas réels. Une même personne peut tenir plusieurs rôles, mais chaque sortie doit avoir un responsable identifié.

Le mode de travail recommandé est de finaliser un petit nombre de gabarits représentatifs, puis de les appliquer à toutes les familles de pages avec leur recette. Les décisions ouvertes restantes concernent la mesure réelle des volumes de données, les rôles représentatifs pour les essais et le calendrier de livraison. Elles n'empêchent pas de préparer le premier lot visuel.

## 13. Réalisation du premier lot — 28 septembre 2026

### Évaluation des bibliothèques proposées

- **Iconify** : framework open source sous licence MIT ; les collections gardent leurs licences propres. Source : https://github.com/iconify/iconify et https://github.com/iconify/icon-sets. Le projet utilise déjà `lucide-react` et la configuration shadcn désigne Lucide. Recommandation : conserver cette famille pour les commandes et la navigation ; utiliser le catalogue Iconify pour un besoin absent (par exemple une intégration), avec SVG embarqué localement et licence documentée. Une migration du moteur de rendu seule ne modifie pas la qualité graphique. Uniformiser tailles, épaisseur et sens des pictogrammes avant de multiplier les familles.
- **React Aria** : gratuit, open source sous Apache-2.0, utilisable dans un produit commercial en respectant la licence. Sources : https://github.com/adobe/react-spectrum et https://react-aria.adobe.com/. Ses composants sont sans style imposé ; ils apportent des comportements accessibles et une gestion des interactions et de l’internationalisation. Freelio utilise déjà shadcn avec Base UI. Recommandation : conserver les primitives actuelles ; évaluer React Aria sur un composant complexe isolé, notamment la saisie de dates/périodes, si le besoin justifie cette dépendance supplémentaire. Un pilote devra vérifier locale française, clavier, focus, lecteur d’écran, mobile et intégration aux formulaires avant extension.

Ces propositions sont évaluées, mais aucune des deux bibliothèques n’est installée à ce stade. La direction visuelle Freelio reste définie par les tokens et les gabarits du présent plan.

La première passe est implémentée dans le code, après accord sur le bleu discret et la priorité au CRM quotidien.

- Fond clair neutre, surfaces blanches, bordures fines, accent bleu et thème sombre assorti ; boutons, champs, tableaux, cartes et en-têtes harmonisés à partir des composants existants, sans nouvelle bibliothèque.
- Navigation latérale claire, regroupement « Clients et ventes », « Facturation » et « Rapports », avec conservation des destinations et favoris ; barre supérieure plus compacte.
- Clients, Devis et Factures : action principale en tête, outils de recherche et filtrage regroupés, montants alignés et adaptation des informations au mobile. La portée des recherches locales est indiquée explicitement.
- Fiche client : synthèse, cinq onglets et action « Créer un devis » avec client prérempli. Les contenus restent montés pour préserver les saisies lors des changements d’onglet.
- Vue d’ensemble et espaces métier : indicateurs regroupés, suppression d’une partie des décorations et ombres ; pipeline neutralisé et défilement horizontal visible.
- Nouvelle recette navigateur dans `tests/e2e/redesign.spec.ts` : listes, recherches réversibles, onglets, devis prérempli, navigation mobile et bascule clair/sombre.

La recette utilise une base SQLite locale isolée et des données QA. Les captures sont conservées dans `test-results/redesign/` et la traversée des 23 pages de référence dans `test-results/*-visual-direction.png`. Ces captures ne constituent pas une comparaison automatique à des images de référence.

Résultats de vérification : TypeScript et ESLint sans erreur ; 16 tests unitaires de navigation/titres réussis ; 12 scénarios navigateur ciblés réussis, avec 2 exclusions propres au type d’appareil ; parcours des 23 pages de référence réussi sur ordinateur. Les vérifications ne couvrent pas encore une facture remplie dans ce jeu de données, les grands volumes ni l’ensemble des opérations métier. Aucun build de production n’a été exécuté pour ce lot.

Ce lot ne termine pas la migration spécifique des 67 pages. Restent notamment la pagination et la recherche côté serveur, la conservation uniforme des filtres dans les URL, les scénarios de volumes importants, la reprise détaillée des formulaires documentaires et des modules secondaires, ainsi que la recette exhaustive du portail et des surfaces publiques. Les limites de données existantes sont signalées, pas corrigées par un changement uniquement visuel. Aucun déploiement n’est réalisé dans ce lot.

## 14. Poursuite de la réalisation — 29 septembre 2026

Cette section actualise le périmètre restant mentionné à la fin du premier lot.

- Clients, Devis et Factures utilisent désormais les actions de lecture dédiées de `src/actions/directories.ts`, avec contrôles d’autorisation, recherche côté serveur, compteurs et pagination de 25 lignes. Les actions existantes d’émission et de traitement des récurrences ne sont pas déplacées dans la recherche.
- Recherche, filtres, tri, colonnes et page sont conservés dans le paramètre `view` de l’URL. L’onglet client est conservé dans `tab`. L’export clients parcourt tous les résultats filtrés ; la sélection reste limitée aux lignes sélectionnées de la page.
- La synthèse des factures calcule l’encours global autorisé plutôt que celui du premier lot chargé.
- Les formulaires devis/factures, l’aperçu documentaire, les lignes commerciales, les contrats, l’organisation, les dépenses, le temps et plusieurs panneaux SAV utilisent les surfaces et titres harmonisés. Les erreurs de saisie des documents persistent dans le formulaire avec transfert du focus ; la saisie est conservée.
- Les erreurs des modules utilisent une présentation commune sans exposer les erreurs techniques brutes. Le chargement est nommé pour les technologies d’assistance et reste contenu sur mobile.
- `DESIGN.md` fixe les conventions. `/dev/design-system` présente les composants en développement et répond par une page introuvable en production.

Le jeu de recette isolé contient 125 clients supplémentaires, 55 devis, 55 factures et un contrat ; `scripts/seed-ui-redesign.mjs` refuse une autre URL de base que celle dédiée à la refonte. Il permet de vérifier des résultats au-delà des anciennes limites ainsi que les noms longs et le retour depuis une fiche.

Limite de performance à conserver dans le suivi : les filtres sur propriétés personnalisées et le tri sur agrégats financiers clients sont calculés côté serveur avant découpage en pages. Seules les 25 lignes demandées sont transférées au navigateur, mais ces modes lisent les candidats en mémoire serveur. Une optimisation SQL ciblée reste nécessaire pour les très grands comptes ; les recherches simples clients et les listes commerciales sont paginées en base. La validation avec lecteurs d’écran et utilisateurs représentatifs reste une recette humaine, non remplacée par les tests automatiques.

Build optimisé réussi, TypeScript réussi, ESLint réussi et 344 tests unitaires réussis avant les derniers tests de contrat des annuaires. Le lancement du serveur en mode production a été refusé par le contrôle automatique avec le motif « blocked by policy » ; la recette navigateur s’exécute donc sur le serveur de développement local. Aucun déploiement réalisé.

### Bilan de vérification final

- Build optimisé relancé après les corrections : réussi, génération des 74 pages statiques et contrôle TypeScript réussis.
- Suite unitaire complète : 81 fichiers, 348 tests réussis. ESLint ciblé réussi.
- Recherche globale, pagination sur 125 clients, recherche de documents au-delà de l’ancien plafond, rechargement et retour depuis un dossier : réussis sur ordinateur et mobile.
- Création de devis et facture après erreur de saisie, conservation des champs, focus de l’erreur et total de 120 € : réussis sur ordinateur et mobile.
- Pages publiques et contrôles des aperçus devis, factures et contrats : réussis sur les deux formats.
- Six scénarios `redesign.spec.ts` réussis : listes, onglets client, client prérempli dans le devis, thèmes et navigation mobile. Au total, 14 scénarios ciblés complémentaires ont passé la recette finale, en plusieurs exécutions.
- Correction supplémentaire : un nom long tronqué à un espace pouvait déclencher une boucle de synchronisation du titre du navigateur ; normalisation corrigée et test de non-régression ajouté.
- Sélecteurs : menu ancré avec limites de collision plutôt qu’alignement sur l’option sélectionnée, pour garder les longues listes utilisables sur mobile. Vues clients enregistrées : application atomique avec retour à la première page.

À la clôture de cette passe, la traversée exhaustive `full-ui-audit.spec.ts` et le parcours complet de réponse et révocation du portail n’étaient pas encore validés. La section suivante suit leur reprise. Cela ne constitue pas une certification exhaustive de chaque opération des 67 pages, ni de conformité WCAG.

## 15. Finalisation et recette du candidat

Compléments réalisés le 29 septembre :

- Contacts : pagination serveur de 25 résultats, recherche et consentement conservés dans l’URL, suppression du plafond de 1 000 contacts pour cet annuaire et contrôle d’appartenance à l’entreprise.
- Clients, contacts, devis et factures : premier résultat rendu côté serveur à partir de l’URL, puis actualisation interactive. L’écran ne présente plus un lot initial différent de la recherche demandée.
- Pipeline : filtre par texte et responsable ; étape sélectionnable sur mobile avec conservation au rechargement. Le déplacement vers « Perdu » passe par le formulaire de motif.
- Vues enregistrées : indication des modifications depuis la vue choisie. Aide, états d’onboarding, notifications et signature harmonisés.
- Référence de composants : contrôles interactifs pour vérifier sélection, case à cocher, thème et fenêtre modale.
- Formulaires commerciaux : grille et totaux corrigés pour les écrans de 320 et 360 px, sans masquer le débordement.

Vérifications acquises pour ces compléments : 349 tests unitaires dans 81 fichiers ; ESLint sur `src` et les nouveaux tests ; cinq gabarits contrôlés aux largeurs 1920, 1440, 1280, 1024, 768, 390, 360 et 320 px ; ouverture/fermeture au clavier avec restitution du focus sur ordinateur et mobile ; recherche contacts, absence de résultat et réinitialisation sur les deux formats ; parcours portail complet (création d’accès, message, rendez-vous, réponse, révocation) ; sélection d’étape du pipeline mobile conservée au rechargement.

Les objectifs d’essais avec 3–5 utilisateurs, de gain de temps et de conformité avec lecteurs d’écran sont des mesures humaines postérieures à la recette technique. Aucun taux de réussite utilisateur ni certification d’accessibilité n’est revendiqué. Le tri client sur agrégats/propriétés reste calculé en mémoire serveur ; le test de pagination contacts à 2 501 résultats vérifie le contrat de requête avec des données simulées, pas une mesure de performance de production.

### Recette complémentaire

- Série de régression : 18 scénarios réussis et une exclusion volontaire de la matrice de largeurs sur le second appareil. Le scénario de création documentaire mobile a échoué une fois sans erreur JavaScript ni navigation après le clic ; sa reprise isolée a réussi pour devis et facture. Cette instabilité reste signalée, pas effacée par la reprise.
- Pipeline : scénario ordinateur et scénario mobile réussis, incluant création, montant pondéré, motif de perte, réouverture et historique.
- Portefeuille SAV : affichage limité à 25 dossiers par page, recherche/page dans l’URL, portée existante de 300 clients explicitée. Tests de pagination, rechargement et accès au dernier dossier réussis sur les deux appareils. Cette pagination d’affichage ne transforme pas le moteur de score en recherche globale serveur.
- Audit ordinateur : 62 routes traversées ; aucun défaut de contraste, de nom accessible ou de débordement détecté. Un incident de compilation à chaud sur le help desk empêche de qualifier cette exécution globale de réussie.
- Lot complémentaire de 15 routes : réussi sur ordinateur (aucune anomalie). Sur mobile, un débordement de la grille achat et une cible trop petite ont été détectés puis corrigés ; les 14 autres routes du lot n’avaient pas de constat.
- Lot final de 12 fiches mobiles : réussi sans anomalie, avec la fiche achat corrigée, les fiches commerciales/SAV/chantier/équipement et les éditeurs de documents.
- Les cinq variantes absentes de la découverte initiale ont été ajoutées à la recette : avenant, redirection de signature, fournisseur, achat, détail d’import. Le seed est strictement limité à la base locale jetable.

La traversée mobile monolithique s’est interrompue lors d’un redémarrage mémoire du serveur de développement. Les lots ciblés sont les résultats fiables ; aucune réussite d’audit monolithique complet n’est revendiquée. Les contrôles automatiques portent sur les états rendus par les données QA, pas sur toutes les combinaisons de rôles et données possibles.

La version conserve les corrections préexistantes d’import, de stockage et de génération documentaire dans le répertoire de travail ; elles ont été relues et leurs tests font partie des 349 tests unitaires réussis. Aucun changement de schéma de base de données n’est nécessaire pour cette refonte.

### Publication

- Build local optimisé réussi : TypeScript et génération des 74 pages statiques terminés sans erreur.
- Déploiement Vercel de production `dpl_7VnrdT1LZnFYSY4p8b3i7fdy2eXz`, créé le 29 septembre 2026 à 14:59 (Paris), confirmé `Ready`.
- URL principale : https://freelio-eight.vercel.app ; version immuable : https://freelio-14hqi66e3-hyhyhyhyhytest-8931s-projects.vercel.app.
- Contrôles après publication : `/api/health/live` 200, `/api/health/ready` 200 (base et configuration OK), `/auth/login` 200, `/dev/design-system` 404 comme prévu.
- Version précédente identifiée pour retour arrière : `dpl_7Zzt4gGNYJd4QoZmTDJW2TWAnG78`.
- Publication depuis le répertoire de travail ; aucun commit ni push Git effectué. Les modifications locales sont conservées. Les données SQLite, les captures et les fichiers d’environnement locaux sont exclus par `.vercelignore`.
