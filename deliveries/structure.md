# Delivery #1: Arborescence Complète du Projet

Voici la structure de dossiers cible pour Freelio, organisée pour maximiser la modularité et respecter les contraintes de sécurité (userId isolation).

```text
freelio/
├── .env                    # Secrets (Stripe, Resend, Gemini, R2)
├── .env.example            # Template pour les nouveaux environnements
├── prisma/
│   ├── schema.prisma       # Schéma source de vérité (27+ modèles)
│   └── seed.ts             # Données de démo (Clients, Services, Projets)
├── public/                 # Assets statiques & Fonts (Geist)
├── src/
│   ├── app/                # Next.js 15 App Router
│   │   ├── (auth)/         # Auth Flow (Login, OTP, Magic Link)
│   │   ├── (dashboard)/    # Dashboard Shell & Modules
│   │   │   ├── clients/    # CRM Client Management
│   │   │   ├── catalogue/  # Service Catalog
│   │   │   ├── pipeline/   # Sales Opportunity Kanban
│   │   │   ├── projets/    # Mission Tracking
│   │   │   ├── devis/      # Quote Generation & List
│   │   │   ├── factures/   # Invoice Management (Factur-X)
│   │   │   ├── contrats/   # Contract Management
│   │   │   ├── depenses/   # Expense Tracking & OCR
│   │   │   ├── temps/      # Time Tracking & Chronometer
│   │   │   ├── comptabilite/ # URSSAF & Tax dashboard
│   │   │   ├── settings/   # Configuration (Company, Integrations)
│   │   │   └── notifications/ # System & Business events
│   │   ├── (public)/       # Portail Client (JWT scoped)
│   │   ├── api/            # Routeurs API REST v1 & Webhooks
│   │   ├── layout.tsx      # Root providers & UI
│   │   └── providers.tsx   # TanStack, Theme, Session providers
│   ├── components/
│   │   ├── layout/         # Shell components (Sidebar, Header, Timer)
│   │   ├── forms/          # Formulaires métiers (Onboarding, QuoteEdit)
│   │   ├── shared/         # DataTable, Dialogs, Charts
│   │   └── ui/             # Radix & Shadcn primitives
│   ├── actions/            # Server Actions (Mutations asynchrones)
│   │   ├── auth/
│   │   ├── clients/
│   │   ├── billing/        # Devis & Factures (Calculs en centimes)
│   │   └── ai/             # Gemini & OCR processing
│   ├── lib/                # Logique métier pure & Singletons
│   │   ├── auth.ts         # Options NextAuth v5
│   │   ├── prisma.ts       # Singleton Prisma Client
│   │   ├── bullmq/         # Producers & Workers (PDF, Mail, Recurrence)
│   │   ├── pdf/            # Puppeteer, Factur-X & R2 Archivage
│   │   ├── gemini/         # System Prompts & SDK AI
│   │   └── stripe/         # Payments & Subscriptions
│   ├── hooks/              # Query hooks & Local UI state
│   ├── types/              # Definitions TS partagées
│   ├── styles/             # Global Tailwind v4 CSS
│   └── emails/             # Templates React Email
├── tests/                  # Architectures de test
│   ├── unit/               # Vitest (Calculs, TVA, Numérotation)
│   └── e2e/                # Playwright (User flows complets)
└── next.config.ts          # Config Next (External images, Bundle analyzer)
```
