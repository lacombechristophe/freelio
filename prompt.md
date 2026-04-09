
══════════════════════════════════════════════════════════
 IDENTITÉ & VISION
══════════════════════════════════════════════════════════

Tu es un développeur senior full-stack expert UI/UX. Tu vas construire
Freelio — une application web complète de gestion pour
auto-entrepreneur français (développeur / automatisation / conseil).

Ce n'est PAS un MVP. C'est un produit fini de niveau commercial,
comparable à Pennylane + Honeybook + Linear, taillé pour un solo dev.

Référence design : Linear, Stripe Dashboard, Notion.
Sobre, dense en information, professionnel, instantané.
Chaque écran doit inspirer confiance à un client grand compte.

Mot d'ordre : simplicité apparente, richesse fonctionnelle.
Tout doit être accessible en 2 clics maximum.


══════════════════════════════════════════════════════════
 STACK TECHNIQUE
══════════════════════════════════════════════════════════

Frontend
  Next.js 15 (App Router, Server Actions, Partial Prerendering)
  TypeScript strict (no any, no as, tsconfig strict: true)
  Tailwind CSS v4 + shadcn/ui (thème Freelio custom)
  Zustand (état UI global)
  TanStack Table v8 (tous les tableaux)
  TanStack Query v5 (cache + sync server state)
  React Hook Form + Zod (tous les formulaires)
  Framer Motion (transitions de page, micro-animations)
  Lucide React (icônes cohérentes partout)
  next-themes (dark mode système + toggle manuel)
  TipTap (éditeur rich text — contrats, notes, descriptions)
  react-dropzone (upload fichiers)
  date-fns (manipulation dates, locale fr)

Backend & Data
  PostgreSQL (Railway) via Prisma ORM
  Redis (Upstash) — cache, sessions, rate limiting, dedup
  BullMQ — jobs async (PDF, emails, récurrences, relances, e-reporting)
  NextAuth.js v5 (credentials + magic link email)
  Zod — validation serveur sur TOUTES les Server Actions et API routes

PDF & Documents
  Puppeteer (service Railway dédié, pool 2 instances Chrome headless)
  @facturx/facturx — Factur-X hybride PDF/A-3 + XML EN 16931
  Handlebars — templates HTML des documents (séparés du code)
  Sharp — optimisation images/logos embarqués dans les PDFs

Signature électronique
  Implémentation maison (suffisant AE) :
    Hash SHA-256 du PDF + timestamp serveur + IP + user agent
    Signature manuscrite canvas (fabric.js) → stockée base64
    Certificat de signature PDF auto-généré et archivé
  Option Yousign API (config dans Paramètres) pour eIDAS qualifié

Emails
  Resend + React Email (templates transactionnels branded)
  Queue BullMQ pour envoi asynchrone
  Webhooks Resend → tracking ouverture / clic

Paiements
  Stripe — liens paiement, webhooks statut, Customer Portal
  GoCardless — prélèvement SEPA (optionnel, config dans Paramètres)

Fichiers & Stockage
  Uploadthing — upload logo, signature, pièces jointes, contrats
  Stockage PDFs générés : filesystem Railway + path en base
  Archivage légal : bucket S3-compatible immuable (Cloudflare R2)

AI
  Google Gemini API — @google/generative-ai SDK
  Modèle : gemini-2.0-flash (gratuit via Google AI Studio)
  Fallback : gemini-1.5-flash si quota dépassé

Infra & Qualité
  Vercel (frontend + API routes)
  Railway (PostgreSQL + Redis + worker BullMQ + Puppeteer service)
  Cloudflare R2 (archivage immuable PDFs légaux)
  Sentry (error tracking + performance frontend et backend)
  Pino (structured logs JSON)
  Vitest (tests unitaires logique métier critique)
  Playwright (tests E2E parcours critiques)
  .env.example documenté, README setup < 5 commandes


══════════════════════════════════════════════════════════
 DESIGN SYSTEM — SPEC COMPLÈTE
══════════════════════════════════════════════════════════

Philosophie
  Dense mais aéré. Chaque pixel a une raison d'être.
  Blanc/gris neutre dominant. Accent unique : Indigo #4F46E5.
  Zéro décoration gratuite. Hiérarchie par taille et poids, pas couleur.
  Dark mode complet et soigné (pas juste inverser les couleurs).

Typographie
  Police UI : Geist Sans (variable font via next/font)
  Police mono (numéros, codes, montants) : Geist Mono
  Échelle px : 11 / 12 / 13 / 14 / 16 / 18 / 24 / 32
  Poids : 400 (body), 500 (label/heading), 600 (titre page)
  Line-height : 1.5 (UI compact), 1.7 (prose, descriptions)

Tokens couleur
  --accent        : #4F46E5   (indigo — CTA, liens actifs, progress)
  --accent-hover  : #4338CA
  --accent-light  : #EEF2FF   (bg badges accent)
  --success       : #059669 / bg #ECFDF5
  --warning       : #D97706 / bg #FFFBEB
  --danger        : #DC2626 / bg #FEF2F2
  --muted         : #6B7280
  --border        : #E5E7EB (light) / #374151 (dark)
  Surfaces light  : #FFFFFF / #F9FAFB / #F3F4F6
  Surfaces dark   : #0F172A / #1E293B / #334155

Composants
  Boutons : primary (accent filled), secondary (outline), ghost, danger
  Badges statut : 11px, pill, couleur sémantique stricte
  Cards : border 1px, radius 8px, padding 16/24px, ombre 0 aucune
  Tableaux : header bg-secondary, hover row 80ms transition, striped opt
  Sidebar : 240px fixe, collapsible → 56px (icônes) sur < 1024px
  Modales : backdrop rgba(0,0,0,0.4), centered, max-w 560/720/full
  Toasts : bas-droit, 4s, action "Annuler" quand pertinent
  Skeletons : sur TOUS les états loading, jamais spinner isolé
  Empty states : SVG simple + titre + phrase utile + bouton CTA principal
  Command palette ⌘K : recherche globale (clients, docs, actions rapides)
  Breadcrumb : sur toutes les pages de détail

Micro-animations (Framer Motion)
  Page transition : fade + translateY(8px) → 0, 180ms ease-out
  Modales : scale(0.97)→1 + opacity, 150ms
  Listes : stagger children 30ms sur mount initial
  Boutons : scale(0.98) active
  Badge statut : layout animation quand changement
  Sidebar collapse : width transition 200ms

Responsive
  Desktop-first. Breakpoints : 768 / 1024 / 1280 / 1536px
  Mobile (768px-) : sidebar drawer, tableaux scroll-x, formulaires wizard
  Tablette (768-1024px) : sidebar collapsed par défaut

Print CSS
  @media print : sidebar/header/boutons masqués
  Document pleine largeur, police 11pt, marges 1.5cm
  Sauts de page intelligents (pas de coupure dans un tableau)

Accessibilité
  WCAG 2.1 AA : contrastes, focus visible, labels form, aria-live
  Navigation clavier complète (tab order logique)
  Raccourcis clavier documentés (? = aide, ⌘K = palette, N = nouveau, / = search)


══════════════════════════════════════════════════════════
 ONBOARDING
══════════════════════════════════════════════════════════

Wizard 5 étapes, skippable, relançable depuis Paramètres :

  1. Identité entreprise
     Nom commercial, prénom/nom, SIRET, adresse
     Logo upload + crop (react-image-crop), couleur d'accent

  2. Coordonnées & légal
     Email pro, téléphone, site web
     TVA (franchise en base ou assujetti + n° TVA intra)
     Code APE, RCS, IBAN + BIC

  3. Préférences facturation
     Numérotation (préfixe, format, compteur de départ)
     Conditions de paiement par défaut
     Taux pénalités de retard (défaut : 12.25% = 3× taux BCE 2026)
     Devise, langue des documents (FR / EN)

  4. Template PDF
     3 designs : Minimal / Corporate / Accent
     Aperçu live du PDF avec vraies données saisies

  5. Premier client (ou skip)
     Import CSV ou saisie manuelle

Post-onboarding : checklist "5 premières actions" dans le dashboard,
disparaît progressivement au fur et à mesure.


══════════════════════════════════════════════════════════
 CRM — CLIENTS
══════════════════════════════════════════════════════════

Fiche client
  Type : Entreprise / Particulier / Administration
  Raison sociale, SIRET (validation format), n° TVA intra
  Adresse facturation (≠ livraison possible)
  Contacts multiples (nom, poste, email, tel, contact principal)
  Référence client interne, notes privées (markdown), tags libres
  Taux horaire spécifique (override catalogue), conditions paiement spécif.
  Fichiers attachés (bons de commande, contrats reçus...)
  Score de relation (calculé : délai paiement moyen, CA, régularité)

Vue liste
  Colonnes : nom, CA total, dernière activité, statut, impayé en cours
  Filtres : tag, statut, période, CA min/max, avec/sans impayé
  Recherche full-text debounce 200ms
  Export CSV sélection, import CSV avec mapping + dédoublonnage

Timeline client
  Chronologie : devis, contrats, factures, paiements, relances, notes, emails
  Chaque event cliquable → ouvre le document
  Filtre par type d'event

Stats client
  CA total / par année, nb projets, délai moyen paiement
  Taux conversion devis, montant impayé actuel
  Graphe CA mensuel sur 12 mois (sparkline)


══════════════════════════════════════════════════════════
 CATALOGUE — PRESTATIONS
══════════════════════════════════════════════════════════

  Services : code, libellé, description (markdown), prix HT,
             unité (heure/jour/forfait/licence/mois/pièce...), taux TVA
  Catégories libres avec ordre drag-and-drop
  Prix client : override du prix catalogue par client
  Archivage (masqué des selects, conservé dans historique)
  Import/export CSV
  Recherche instantanée dans les selects (fuzzy match)


══════════════════════════════════════════════════════════
 PROJETS [NOUVEAU]
══════════════════════════════════════════════════════════

Hub central qui relie tous les éléments d'une mission :

Fiche projet
  Nom, description, client, statut (prospect/en cours/terminé/archivé)
  Date début / fin prévue / fin réelle
  Budget total estimé (HT) et réalisé
  Couleur/emoji pour identification rapide dans les listes

Liens vers les documents
  Devis liés, contrat signé, factures, avoirs
  Entrées de temps (time tracking)
  Dépenses liées
  Fichiers attachés (briefs, maquettes, livrables...)

Vue projet
  Résumé financier : budget vs réalisé (heures × taux + dépenses)
  Progression : % du budget consommé, heures restantes estimées
  Timeline : milestones configurables avec statut et date
  Rentabilité calculée : CA facturé − dépenses − (heures × coût horaire interne)

Vue liste projets
  Kanban : colonnes par statut (drag-and-drop)
  Tableau : triable par client, budget, deadline, rentabilité
  Filtre par client, période, statut


══════════════════════════════════════════════════════════
 PIPELINE COMMERCIAL [NOUVEAU]
══════════════════════════════════════════════════════════

Kanban des opportunités commerciales, de la prise de contact à la signature :

Colonnes par défaut (personnalisables)
  1. Prospect identifié
  2. Contact pris
  3. Besoin qualifié
  4. Devis envoyé
  5. En négociation
  6. Gagné → crée le projet automatiquement
  7. Perdu → archivé avec motif

Fiche opportunité
  Titre, client (existant ou nouveau), valeur estimée
  Probabilité de closing (%), date estimée de closing
  Notes de qualification (markdown)
  Activités : appels, emails, RDV (saisie manuelle + date)
  Devis lié (ou création directe depuis l'opportunité)

Stats pipeline
  CA potentiel total par colonne
  Taux de conversion par étape
  Durée moyenne par étape
  Forecast : CA probable (valeur × probabilité) sur 30/60/90j


══════════════════════════════════════════════════════════
 TIME TRACKING
══════════════════════════════════════════════════════════

  Chronomètre sidebar (start/stop, toujours visible, persiste entre pages)
  Saisie manuelle : date, durée, client, projet, description, facturable
  Vue semaine agenda (glisser-déposer pour modifier durée/position)
  Vue liste filtrée par client / projet / période / facturable
  Taux horaire par défaut, par client, par projet
  Export vers facture : sélection entrées → lignes générées automatiquement
  Rapport : heures/client, heures/projet, taux d'occupation mensuel
  Import CSV (Toggl, Clockify, Harvest, format custom)
  Rappel si pas d'entrée depuis X heures (configurable, notif in-app)


══════════════════════════════════════════════════════════
 DEVIS
══════════════════════════════════════════════════════════

Création
  Numérotation auto (DEV-2026-001, configurable)
  Client sélect + search, création inline possible
  Objet / titre de la mission
  Lignes : service du catalogue ou libre, qté × prix × remise %
  Groupes de lignes avec titre et sous-total
  Remise globale % ou montant fixe
  TVA par ligne (taux différents) ou globale
  Récapitulatif HT / TVA ventilée / TTC
  Acompte demandé (% ou montant fixe)
  Conditions de paiement, durée de validité
  Notes internes (non imprimées) et notes client (imprimées)
  Conditions particulières (texte libre, imprimé en bas)
  Projet lié (existant ou création inline)

Workflow statuts
  brouillon → envoyé → accepté / refusé / expiré
  Accepté → option : créer facture | créer contrat | créer projet

Lien de validation client
  URL JWT signée (expire à la date de validité)
  Page publique branded : aperçu PDF inline + "Accepter"
  Signature manuscrite canvas (fabric.js) ou click horodaté + IP
  Email confirmation auto aux deux parties
  PDF regénéré avec mention ACCEPTÉ + date + signature embarquée

Versioning
  Chaque modification → nouvelle version numérotée
  Comparaison visuelle entre versions
  Restauration d'une version antérieure (crée une nouvelle version)


══════════════════════════════════════════════════════════
 CONTRATS
══════════════════════════════════════════════════════════

7 templates juridiques livrés
  1. Contrat de prestation de services (générique)
  2. Lettre de mission (consulting, audit, formation)
  3. Contrat de développement web/logiciel
  4. Contrat de maintenance informatique
  5. NDA bilatéral (accord de confidentialité)
  6. CGV (Conditions Générales de Vente — annexe factures/devis)
  7. Avenant / modification de contrat

  Clauses incluses : objet, durée, obligations, propriété intellectuelle,
  confidentialité, responsabilité limitée, résiliation, droit français,
  juridiction Tribunal de Commerce, mentions RGPD si données traitées.

Éditeur de contrats
  TipTap WYSIWYG avec variables : {{client.nom}}, {{client.siret}},
  {{mission.objet}}, {{mission.budget}}, {{devis.numero}},
  {{date.debut}}, {{date.fin}}, {{entreprise.nom}}, etc.
  Bibliothèque de clauses (drag-and-drop dans le document)
  Numérotation automatique des articles
  Aperçu PDF live dans panneau latéral (debounce 1.5s)

Workflow signature
  1. Contrat créé (depuis template ou depuis devis accepté)
  2. Envoi email avec lien sécurisé (JWT, expire 30j)
  3. Page signature publique : scroll tracker (lecture obligatoire 80%),
     case à cocher "Lu et approuvé", signature canvas
  4. Horodatage serveur, hash SHA-256 PDF + signature, IP, UA
  5. Certificat de signature généré (PDF séparé archivé)
  6. Email aux deux parties : contrat signé + certificat en PJ
  7. Statut → Signé, document verrouillé définitivement

Gestion
  Statuts : brouillon / envoyé / signé / expiré / résilié
  Alertes expiration (J-30, J-7)
  Renouvellement : dupliquer + modifier dates
  Avenant : document lié au contrat parent
  Lien vers devis et factures associées


══════════════════════════════════════════════════════════
 FACTURES
══════════════════════════════════════════════════════════

Mentions légales obligatoires (exhaustif 2026)
  Numéro séquentiel sans trou ni doublon (FACT-2026-001)
  Date émission + date prestation/livraison distincte
  Identité émetteur : nom, adresse, SIRET, n° TVA, forme juridique
  Identité client : raison sociale, adresse, SIRET si pro
  Description précise des prestations
  Prix unitaire HT, quantité, remise, montant HT par ligne
  Total HT / TVA ventilée par taux / total TTC
  Mode règlement, délai, date d'échéance exacte
  Pénalités retard : taux (12.25% en 2026), mention légale exacte
  Indemnité forfaitaire recouvrement : 40 € (art. D441-5 C.com)
  Franchise TVA : "TVA non applicable - art. 293 B du CGI"
  Mentions e-invoicing 2026 :
    Catégorie opération (prestation de services = S)
    Option TVA sur débits si applicable
    Numéro SIREN acheteur
  RIB / IBAN + BIC
  QR code → portail client (consultation + paiement en ligne)
  Hash intégrité SHA-256 discret en pied de page

Types
  Classique, Acompte, Situation (avancement), Finale, Avoir

Workflow
  brouillon → émise → envoyée → [partiellement payée] → payée
                              → en retard (auto J+1 échéance)
                              → annulée (via avoir obligatoire)

Récurrentes
  Fréquence, date début/fin, génération auto BullMQ
  Envoi auto optionnel, notif in-app à chaque génération

Verrouillage
  Toute facture émise : verrouillée + PDF archivé Cloudflare R2
  Les PDFs archivés sont read-only et signés avec hash
  Correction uniquement via avoir


══════════════════════════════════════════════════════════
 ACOMPTES, SITUATIONS & AVOIRS
══════════════════════════════════════════════════════════

Acomptes
  Générés depuis devis (% ou montant)
  Mention "Acompte sur devis n° DEV-2026-XXX"
  Déduits automatiquement de la facture finale
  Traçabilité complète acompte → facture finale

Situations de travaux
  Facturation progressive par % d'avancement
  Récapitulatif des situations précédentes sur chaque nouvelle
  Solde restant à facturer calculé automatiquement

Avoirs
  Total (annule) ou partiel (lignes ou montant libre)
  Numérotation propre AV-2026-001
  Lien obligatoire vers facture d'origine
  Impact traçé dans livre de recettes


══════════════════════════════════════════════════════════
 PORTAIL CLIENT
══════════════════════════════════════════════════════════

  Accès sans compte (lien JWT scopé par client) ou magic link
  URL branded : app.freelio.fr/portail/[slug-entreprise]
  Zéro mention "Freelio" visible (white-label complet)

Ce que voit le client
  Devis en attente → acceptation + signature canvas
  Contrats à signer ou déjà signés → téléchargement
  Factures (statut, montant) → téléchargement PDF
  Lien de paiement Stripe sur factures impayées
  Coordonnées modifiables (mise à jour auto dans CRM)

Sécurité
  Chaque lien : unique, expirant, scopé (1 client uniquement)
  Rate limiting 30 req/min sur les endpoints publics
  Log consultation : date, IP, document consulté → visible dans CRM


══════════════════════════════════════════════════════════
 DÉPENSES
══════════════════════════════════════════════════════════

  Saisie : date, montant TTC, catégorie, fournisseur, description, projet
  Catégories : Matériel, SaaS/Logiciels, Déplacements, Repas, Formation,
               Téléphonie, Sous-traitance, Loyer bureau, Divers
  Upload justificatif (photo ou PDF) — OCR basique (Gemini Vision)
    → extraction automatique date + montant proposée à validation
  Statuts : à justifier / justifiée / remboursée
  Rapport : par catégorie, par mois, par projet
  Export CSV pour comptable

  Note affichée clairement dans l'app :
  "En auto-entrepreneur franchise de base, les dépenses sont des
  charges de gestion informationnelles uniquement — aucune TVA
  n'est déductible. Consultez votre comptable pour le passage
  au régime réel si vos dépenses sont significatives."


══════════════════════════════════════════════════════════
 PDF & TEMPLATES DE DOCUMENTS
══════════════════════════════════════════════════════════

Architecture Puppeteer
  Service Railway dédié — pool 2 Chrome headless
  Cache Redis : hash(document_id + version + template) → PDF 1h TTL
  Invalidation cache sur modification du document
  Queue BullMQ pour générations multiples (export lot)
  Génération < 1.5s document standard, < 4s document long
  Watermark auto : BROUILLON (rouge diagonal) / ANNULÉ / COPIE

3 templates (choix à l'onboarding, changeable)

  Minimal — typographie seule, trait fin, très aéré
  Corporate — bandeau couleur pleine largeur, tableau structuré
  Accent — numéro document grand format, couleur d'accent sur totaux

Éléments communs
  Logo entreprise (SVG/PNG fond transparent géré par Sharp)
  Polices Geist embarquées base64 (rendu identique partout)
  QR code vérification (lien portail client)
  Hash SHA-256 intégrité (pied de page, 8pt, discret)
  Pagination : "Page 1/3", sauts de page intelligents
  Signature client : image canvas base64 + "Signé le [date] — Cert. n°[hash]"

Éditeur de template
  Interface HTML/CSS direct (CodeMirror embedded)
  Aperçu PDF live rechargé à chaque sauvegarde (debounce 2s)
  Reset vers template original
  Export template personnalisé pour sauvegarde


══════════════════════════════════════════════════════════
 FACTURE ÉLECTRONIQUE & CONFORMITÉ 2026-2027
══════════════════════════════════════════════════════════

Formats générés
  Factur-X PDF/A-3 hybride (profils MINIMUM → BASIC WL → EN 16931)
  UBL 2.1 XML (alternative)
  Validation XSD obligatoire avant toute émission

Mapping automatique
  Tous les champs BT/BG EN 16931 mappés depuis les données de l'app
  Erreurs de mapping affichées clairement avec correction guidée

Intégration PDP
  Config dans Paramètres : URL endpoint, clé API, identifiant PDP
  Envoi auto des factures B2B via API PDP
  Réception accusés de réception et statuts de vie (sync)
  Log d'envoi complet par facture

e-Reporting
  Agrégation auto : B2C, international, opérations exonérées
  Fichier au format DGFIP → transmission périodique via PDP
  Historique des transmissions

Dashboard conformité
  Checklist interactive : PDP configurée, SIREN clients renseignés,
  catégorie opération, mentions 2026 présentes
  Alertes proactives : clients sans SIREN, factures non transmises
  Compteur : X/Y factures transmises ce mois


══════════════════════════════════════════════════════════
 PAIEMENTS & RELANCES
══════════════════════════════════════════════════════════

Paiements
  Modes : virement, SEPA, carte, chèque, espèces, autre
  Partiels avec solde restant mis à jour en temps réel
  Reconciliation Stripe (webhooks → auto-marquage payée)
  Lien Stripe pré-rempli sur chaque facture émise

Relances automatiques (BullMQ)
  Règles par défaut + override par client :
    J-3 avant échéance : rappel cordial
    J+0 : rappel doux
    J+7  : relance standard
    J+15 : relance ferme
    J+30 : mise en demeure formelle (mention pénalités légales exactes)
  Templates Resend modifiables, variable-driven
  Bouton "Suspendre les relances" par facture
  Historique relances envoyées (date, template utilisé)

Suivi impayés
  Tableau aging : 0-30 / 30-60 / 60-90 / +90 jours
  Montants totaux par tranche, liste factures
  Export CSV pour huissier / cabinet de recouvrement


══════════════════════════════════════════════════════════
 DASHBOARD
══════════════════════════════════════════════════════════

KPIs (haut de page, 6 cards)
  CA mois (vs mois précédent, delta %)
  CA année (vs objectif configurable, barre progression)
  Impayés : montant total + nombre de factures
  Devis en attente : montant + taux conversion last 90j
  Heures ce mois : total + part facturable
  Seuil franchise TVA : barre progress vers 37 700 €

Graphiques
  Barres : CA mensuel 12 mois vs N-1
  Donut : CA par client top 5 + autres
  Ligne : évolution impayés (3 mois glissants)
  Mini-sparkline par KPI card

Activité récente
  50 derniers events chronologiques, icône + description + lien

Actions rapides
  Nouveau devis / facture / client / chrono time tracking
  Enregistrer un paiement (recherche facture inline)

Alertes prioritaires
  Factures en retard (liste avec montant + nb de jours)
  Devis expirant dans < 7j
  Contrats à renouveler dans < 30j
  Rappel cotisations URSSAF (dates configurables)
  Alerte seuil TVA (80%, 90%, 100%)


══════════════════════════════════════════════════════════
 COMPTABILITÉ & URSSAF
══════════════════════════════════════════════════════════

  Livre de recettes : généré auto depuis factures payées,
    format conforme URSSAF, export PDF + CSV
  Déclaration URSSAF : CA encaissé à déclarer par période,
    cotisations estimées (21.2% BIC ou 21.1% BNC — configurable)
  Rappels calendaire intégrés (mensuel ou trimestriel selon régime)
  Journal des ventes FEC-lite (date, n° pièce, client, HT, TVA, TTC)
  Export mensuel/annuel XLSX compatible comptable
  Récapitulatif annuel PDF (CA, TVA si applicable, dépenses)
  Alertes seuils : franchise TVA 37 700 €, micro 77 700 €


══════════════════════════════════════════════════════════
 NOTIFICATIONS [NOUVEAU]
══════════════════════════════════════════════════════════

Centre de notifications in-app
  Cloche dans le header, badge compteur non lus
  Liste chronologique : icône type, titre, description, lien, date relative
  Marquer tout comme lu, supprimer, filtrer par type
  Persisté en base (lu/non lu par utilisateur)

Types de notifications
  Devis accepté ou refusé par le client
  Contrat signé par le client
  Facture vue dans le portail client
  Paiement reçu (Stripe webhook)
  Facture passée en retard automatiquement
  Relance automatique envoyée
  Facture récurrente générée
  Alerte seuil TVA (80%, 90%, dépassement)
  Rappel cotisations URSSAF (J-7)
  Contrat expirant dans 30j
  Erreur envoi PDP (facture électronique)
  Rappel time tracking (pas d'entrée depuis X heures)

Préférences par canal
  Paramètre par type de notif : In-app seulement / Email + In-app / Aucune
  Digest email quotidien en option (résumé des activités du jour)
  Plages horaires "ne pas déranger" (pas d'email la nuit)


══════════════════════════════════════════════════════════
 PARAMÈTRES [NOUVEAU]
══════════════════════════════════════════════════════════

Page Paramètres structurée en sections :

  Entreprise
    Toutes les infos légales, logo, signature manuscrite upload/canvas
    Coordonnées bancaires (IBAN/BIC — chiffré en base)
    CGV par défaut (texte affiché sur les factures/devis)

  Documents
    Numérotation : préfixes, formats, compteurs actuels (FACT / DEV / AV / CONT)
    Template PDF actif + éditeur de template
    Langue des documents, devise
    Mentions légales pied de page personnalisées

  Facturation
    Conditions de paiement par défaut
    Taux TVA par défaut
    Pénalités de retard : taux et texte affiché
    Règles de relance par défaut

  Compte utilisateur
    Email, mot de passe, authentification 2FA (TOTP)
    Sessions actives (liste + révocation)
    Préférences : format date, heure, devise affichage

  Notifications
    Préférences canal par type (voir module Notifications)
    Digest email, plages "ne pas déranger"

  Intégrations
    Stripe : clé API, mode test/prod, webhook URL
    GoCardless : clé API, mandat SEPA
    PDP e-invoicing : URL, clé API, identifiant
    Yousign : clé API (signature eIDAS qualifiée)
    Gemini AI : clé API Google AI Studio

  Danger zone
    Export complet des données (ZIP : JSON + tous les PDFs)
    Suppression du compte (anonymisation, conservation légale 10 ans)
    Relancer l'onboarding


══════════════════════════════════════════════════════════
 INTÉGRATIONS & API [NOUVEAU]
══════════════════════════════════════════════════════════

Webhooks sortants
  L'utilisateur configure des endpoints URL qui reçoivent des events :
  invoice.created / invoice.paid / quote.accepted / contract.signed
  Payload JSON structuré, signature HMAC-SHA256 pour vérification
  Dashboard webhooks : historique des appels, statut HTTP, retry manuel
  Retry automatique exponentiel sur échec (3 tentatives, BullMQ)

API publique REST (lecture seule pour commencer)
  GET /api/v1/clients — liste clients
  GET /api/v1/invoices — liste factures (filtrable)
  GET /api/v1/invoices/:id — détail + PDF URL
  GET /api/v1/quotes/:id — détail devis
  Authentification : API key générée dans Paramètres
  Rate limiting : 100 req/min, headers X-RateLimit-*
  Documentation OpenAPI 3.0 auto-générée (Swagger UI)

Zapier / Make (n8n)
  Triggers disponibles via webhooks (voir ci-dessus)
  Actions disponibles via API (créer client, créer facture)
  Template Zap documenté dans l'aide : "Facture payée → Notion / Slack / Sheet"


══════════════════════════════════════════════════════════
 SAUVEGARDE & RGPD [NOUVEAU]
══════════════════════════════════════════════════════════

Archivage légal automatique
  Chaque PDF émis (facture, contrat, avoir, certificat signature)
  → archivé immédiatement sur Cloudflare R2 (bucket immuable, Worm policy)
  → hash SHA-256 stocké en base pour vérification d'intégrité
  Durée conservation : 10 ans (obligation légale)
  Suppression compte = anonymisation données perso, PDFs conservés

Export données utilisateur
  Bouton "Exporter mes données" dans Paramètres
  Export async (BullMQ) → ZIP contenant :
    - JSON complet (clients, devis, contrats, factures, paiements, dépenses)
    - Tous les PDFs générés
    - CSV livre de recettes
  Lien de téléchargement par email dans les 10 minutes
  RGPD : droit à la portabilité respecté

Sauvegarde base de données
  Railway : backups PostgreSQL quotidiens (30j de rétention)
  Snapshot manuel disponible depuis le dashboard Railway

Conformité RGPD
  Bandeau consentement au premier accès
  Politique de confidentialité générée automatiquement (template)
  Registre des traitements : liste des données collectées + finalité
  Droit à l'effacement : supprime données perso, anonymise documents légaux
  DPA (Data Processing Agreement) disponible si sous-traitance données clients


══════════════════════════════════════════════════════════
 ASSISTANT AI — GOOGLE GEMINI [MISE À JOUR]
══════════════════════════════════════════════════════════

Configuration
  SDK : @google/generative-ai (officiel Google)
  Modèle principal  : gemini-2.0-flash (gratuit, Google AI Studio)
  Modèle fallback   : gemini-1.5-flash (si quota flash-2.0 dépassé)
  Modèle vision     : gemini-2.0-flash (multimodal, pour OCR dépenses)
  Clé API : saisie dans Paramètres → Intégrations → Gemini AI
  Toutes les requêtes Gemini passent par le serveur Next.js
  (la clé n'est JAMAIS exposée côté client)

Appel API type
  import { GoogleGenerativeAI } from "@google/generative-ai"
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
  const result = await model.generateContent(prompt)
  const text = result.response.text()

Fonctionnalités AI (rédactionnel uniquement)

  Descriptions de prestation
    5 mots → description pro, boutons : Reformuler / Plus formel / Raccourcir

  Génération de clauses contractuelles
    Sélectionner un type → clause rédigée → l'utilisateur valide avant insertion
    Ex : propriété intellectuelle, confidentialité, résiliation anticipée

  Emails de relance
    Contexte auto (montant, retard, historique) → email proposé
    3 tons : Cordial / Standard / Ferme
    L'utilisateur prévisualise et envoie

  Analyse de devis
    "Vérifier ce devis" → Gemini signale incohérences, ambiguïtés, oublis

  Résumé de la relation client
    Bullet points : dernière interaction, comportement paiement, projets actifs

  OCR justificatifs de dépenses (Vision)
    Upload photo reçu → extraction date + montant + fournisseur proposée

  Génération d'objet de facture / mission
    Décrire en 3 mots → libellé professionnel proposé

L'AI ne touche JAMAIS aux calculs financiers, numérotation ou données légales.
Ces domaines restent 100% déterministes. Gemini = assistant rédactionnel.

Safeguards
  Rate limiting serveur : 30 appels/heure/utilisateur (Redis)
  Timeout 10s par appel (UX : spinner + message d'attente)
  Fallback élégant si API indisponible (formulaire sans AI, pas de crash)
  Compteur d'utilisation affiché dans Paramètres
  System prompt hardcodé côté serveur (non modifiable par l'utilisateur)
  Jamais de données client sensibles envoyées à Gemini
    (pas de SIRET, IBAN, montants précis — contexte minimal uniquement)


══════════════════════════════════════════════════════════
 ARCHITECTURE & QUALITÉ
══════════════════════════════════════════════════════════

Schéma Prisma — toutes les entités
  User, Company, Client, Contact, ClientFile,
  Service, ServiceCategory,
  Project, ProjectMilestone, ProjectFile,
  Pipeline, Opportunity, OpportunityActivity,
  TimeEntry,
  Quote, QuoteVersion, QuoteLine, QuoteSection,
  Contract, ContractTemplate, ContractClause, ContractSignature,
  Invoice, InvoiceLine, InvoicePayment, CreditNote,
  RecurringInvoice, RecurringInvoiceOccurrence,
  Expense, ExpenseFile,
  Notification, NotificationPreference,
  WebhookEndpoint, WebhookDelivery,
  ApiKey,
  EmailLog, RelanceConfig, RelanceLog,
  EInvoiceLog, EReportingBatch,
  AuditLog,  ← immutable, toutes les actions importantes

Sécurité
  Toutes données scoped par userId (middleware centralisé)
  CSRF sur toutes les mutations (Server Actions Next.js)
  Rate limiting Redis : login 5/15min, AI 30/heure, API publique 100/min
  Chiffrement AES-256-GCM : IBAN, clés API tierces, tokens PDP
  Headers sécurité : CSP strict, HSTS, X-Frame-Options DENY
  Validation Zod systématique côté serveur
  Jamais de trust du client sur des données financières

Tests
  Vitest : numérotation séquentielle (concurrence), calculs TVA (centimes),
           génération Factur-X (validation XSD), workflow statuts,
           aging impayés, calcul relances, hash archivage
  Playwright : onboarding complet, acceptation devis, signature contrat,
               paiement Stripe (mode test), export données RGPD

Performance
  Dashboard KPIs : ISR 60s + revalidate on mutation
  Listes : pagination cursor (jamais offset)
  PDF : cache Redis invalidé sur modification
  Images : Sharp + next/image + Cloudflare CDN
  Bundle : code splitting par module, lazy TipTap + Puppeteer client

Observabilité
  Sentry : errors + perf traces + session replay (sampling 10%)
  Pino : JSON logs structurés (userId, action, documentId, duration)
  BullMQ UI : dashboard jobs (completed/failed/pending/delayed)
  Uptime monitoring : Better Uptime ou Checkly


══════════════════════════════════════════════════════════
 CONTRAINTES ABSOLUES — JAMAIS NÉGOCIABLES
══════════════════════════════════════════════════════════

NUMÉROTATION
  Zéro trou, zéro doublon sur les numéros de facture.
  PostgreSQL advisory lock + transaction sérialisable.
  Test de concurrence obligatoire (100 inserts simultanés).

IMMUTABILITÉ
  Facture émise = verrouillée + PDF archivé R2 immédiatement.
  Le PDF archivé ne peut jamais être regénéré ni remplacé.
  Seul un avoir corrige. Aucune exception.

ISOLATION DONNÉES
  Middleware centralisé vérifie userId sur chaque ressource.
  Test : un utilisateur A ne peut jamais voir les données de B.

CALCULS MONÉTAIRES
  Tous montants stockés en centimes (integer) en base.
  BigInt côté serveur pour les opérations. Jamais de float.
  Affichage : toFixed(2) avec formatage locale fr-FR.

ARCHIVAGE 10 ANS
  Factures et PDFs : R2 Worm policy, irrécupérable avant 10 ans.
  Suppression compte = anonymisation, jamais effacement des documents.

RGPD
  Effacement = anonymisation (prénom, email → "[Supprimé]").
  Documents légaux conservés même après demande d'effacement.
  Export données sous 10 minutes.

GEMINI — DONNÉES SENSIBLES
  Jamais de SIRET, IBAN, numéros de facture, montants précis envoyés.
  Contexte minimal : type de document, ton demandé, quelques mots clés.
  System prompt hardcodé serveur, non overridable.

══════════════════════════════════════════════════════════
 LIVRAISON ATTENDUE — ORDRE STRICT
══════════════════════════════════════════════════════════

Avant toute ligne de code, livrer dans l'ordre :

  1. Arborescence complète du projet (tree --level=3)
  2. Schéma Prisma complet avec toutes les relations et indexes
  3. Plan des routes Next.js App Router (layout hierarchy complète)
  4. Plan des queues BullMQ (nom queue, jobs, schedule, retry policy)
  5. Plan des templates PDF (structure HTML skeleton pour chaque type)
  6. Plan des emails React Email (liste des templates transactionnels)

Je valide chaque point, puis développement module par module.
Chaque livraison = code complet et fonctionnel.
Zéro placeholder. Zéro TODO. Zéro "à implémenter plus tard".
