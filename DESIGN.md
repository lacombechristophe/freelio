# Interface Freelio

CRM professionnel utilisé quotidiennement pour retrouver un dossier, préparer un devis, suivre une opportunité et encaisser une facture. Priorité à la lecture des données, aux actions explicites et au clavier. Direction retenue : claire, neutre, bleu discret, inspirée de la précision des captures Cloudflare sans reprendre sa marque.

## Fondations

Les tokens de `src/app/globals.css` sont la source de vérité. Fond `#fafafa`, cartes blanches, texte `#171717`, texte secondaire `#5c5c5c`, action `#1463e5`. Le thème sombre utilise les mêmes rôles sémantiques. Ne pas écrire de nouvelles couleurs décoratives dans les composants métier. Rouge pour erreurs/retards, vert pour réussite, ambre pour avertissement ; toujours accompagner la couleur d’un libellé.

Geist Sans, texte courant 14 px, labels 12–14 px, titres de page 28 px. Titres en casse phrase, chiffres tabulaires pour les montants, montants alignés à droite. Icônes Lucide de 16–20 px, sans bloc coloré décoratif ; boutons uniquement iconographiques nommés pour les technologies d’assistance.

Surfaces délimitées par une bordure fine, rayon 6–8 px. Pas d’ombre décorative ni transparence sur les barres fixes. L’accent bleu signale l’action principale et la sélection. Espacements usuels 8, 12, 16, 24 et 32 px. Les fenêtres utilisent les primitives existantes Base UI ; pas de remplacement global par une autre bibliothèque.

## Composition

- `PageHeader` : titre, explication courte et action principale.
- `ListToolbar` : recherche puis commandes adaptées à la liste ; pagination et résultats sous le tableau. Les listes principales interrogent le serveur et conservent l’état `view` dans l’URL.
- `RecordSummary` : synthèse compacte ; `RecordTabs` : sections de fiche avec onglet conservé dans l’URL et contenu monté pour préserver les saisies.
- Formulaires commerciaux : destinataire, prestations, synthèse ; erreur persistante avec focus via `FormError`. La confirmation d’enregistrement ne dépend pas seulement d’une notification.
- `EmptyState` : distinguer absence de données et absence de résultat filtré. Une recherche doit toujours pouvoir être réinitialisée.

## Adaptation et contrôle

Navigation latérale sur grand écran, panneau mobile avec restitution du focus. Les listes commerciales mobiles regroupent identité et statut ; les données supplémentaires restent dans la fiche. Les tableaux complexes défilent à l’intérieur de leur zone. Le pipeline affiche des colonnes sur ordinateur et une étape sélectionnable sur mobile ; recherche, responsable et étape sont conservés dans l’URL. Ne jamais masquer un débordement global pour faire passer un test.

Objectif WCAG AA : contrastes, noms accessibles, clavier, états non fondés sur la couleur, focus visible. La vérification automatique ne remplace pas une recette avec lecteur d’écran. Cible tactile confortable 44 px sur mobile ; respecter le mouvement réduit.

Référence de composants locale : `/dev/design-system` (404 en production). Plan et décisions : `docs/ui-ux-redesign-plan-2026-09-28.md`. Tests : `redesign.spec.ts`, `directory-pagination.spec.ts`, `task-usability.spec.ts`, `full-ui-audit.spec.ts` et parcours métier de `critical-flows.spec.ts`.
