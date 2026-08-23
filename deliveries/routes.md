# Delivery #3: Plan des Routes Next.js App Router

Voici la hiérarchie complète des segments et layouts pour Freelio. Chaque route (dashboard) est protégée par un middleware vérifiant l'appartenance de la ressource au `userId`.

## 1. Groupe (auth) - Public / Entrée
Routes d'accès et d'onboarding initial. Utilise un `auth-layout`.

- `/login` : Entrée OTP / Magic Link.
- `/register` : Création de compte.
- `/onboarding` : Wizard multi-étapes (Identity -> Legal -> Billing -> Template -> First Client).

## 2. Groupe (dashboard) - Application Privée
Sœur du `Shell` (Sidebar + Header + Navigation). Utilise un `dashboard-layout` avec persistance du timer.

- `/dashboard` : Home (Stats KPI, Actions prioritaires, Feed de notifications).
- `/dashboard/clients/`
    - `/` : Liste DataTable & Recherche.
    - `/[id]` : Fiche détaillée (Dossier client, Timeline, Relations).
- `/dashboard/catalogue` : Liste des prestations, catégories et tarifs.
- `/dashboard/pipeline` : Kanban commercial (Prospect -> Devis signé).
- `/dashboard/projets/`
    - `/` : Liste des missions actives.
    - `/[id]` : Espace projet (Fichiers, Milestones, Budget consommé).
- `/dashboard/devis/`
    - `/` : Liste chronologique.
    - `/new` : Créateur de devis assisté par AI.
    - `/[id]` : Vue détaillée, versions et conversion en facture.
- `/dashboard/factures/`
    - `/` : Liste & Filtres conformes (Factur-X).
    - `/[id]` : Relance, Enregistrement paiement, Avoir.
- `/dashboard/contrats/`
    - `/` : Liste & Templates.
    - `/[id]` : Éditeur TipTap & workflow de signature.
- `/dashboard/depenses` : Tracking des charges & OCR Gemini Vision.
- `/dashboard/temps` : Saisie temps passé & Agenda hebdomadaire.
- `/dashboard/comptabilite` : Livre de recettes & Estimations URSSAF.
- `/dashboard/notifications` : Centre d'alertes métier & système.
- `/dashboard/settings` : Setup Compte, Entreprise, Intégrations (Stripe, R2).

## 3. Groupe (public) - Portail Client
Routes accessibles uniquement via lien sécurisé ou JWT (Client Portal).

- `/portail/[clientSlug]` : Tableau de bord côté client.
- `/portail/devis/[id]` : Visualisation & Signature électronique.
- `/portail/factures/[id]` : Visualisation & Paiement Stripe.
- `/portail/shared/[fileToken]` : Accès direct aux fichiers partagés.

## 4. API & Webhooks
Routes sans UI pour les intégrations.

- `/api/auth/[...nextauth]` : Handlers NextAuth.
- `/api/v1/` : Endpoints REST pour outils externes (Zappier, Make).
- `/api/webhooks/stripe` : Gestion des paiements.
- `/api/webhooks/pdp` : (Futur) Réception statuts e-invoicing.
