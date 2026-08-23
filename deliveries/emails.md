# Delivery #6: Plan des Emails React Email

Les communications de Freelio sont sobres, professionnelles et transactionnelles, envoyées via Resend.

## 1. Groupe AUTH (Sécurité)
- **`MagicLink`** :
    - Déclencheur : Demande de login.
    - Contenu : Bouton de connexion unique + code à 6 chiffres (fallback).
- **`OnboardingWelcome`** :
    - Déclencheur : Finalisation du wizard.
    - Contenu : Guide rapide de démarrage, lien vers le premier client.

## 2. Groupe BILLING (Documents)
- **`DocumentSent`** (Devis/Facture) :
    - Déclencheur : Envoi manuel ou automatique.
    - Contenu : Lien vers le Portail Client (JWT), montant HT/TTC, bouton "Voir et Payer".
- **`PaymentReceived`** :
    - Déclencheur : Succès Stripe ou validation manuelle.
    - Contenu : Confirmation de paiement, lien de téléchargement facture.
- **`RelanceStandard`** (3 types) :
    - `L1` (J+1) : Courtois, rappel d'oubli.
    - `L2` (J+7) : Formel, demande de date de virement.
    - `L3` (J+15) : Urgent, mentions légales des pénalités de retard.

## 3. Groupe CRM & PORTAIL
- **`PortalAccess`** :
    - Déclencheur : Invitation client.
    - Contenu : Lien personnalisé vers l'espace client sécurisé.
- **`ContractSigning`** :
    - Déclencheur : Envoi de contrat.
    - Contenu : Lien vers l'éditeur de signature en ligne.

## 4. Groupe SYSTEM (Rapports)
- **`WeeklyDigest`** :
    - Déclencheur : Lundi 08:00 (Job BullMQ).
    - Contenu : Résumé CA de la semaine, factures à relancer, agenda temps.
- **`UrssafReminder`** :
    - Déclencheur : J-2 avant la fin de période déclarative.
    - Contenu : Chiffre d'affaires à déclarer via l'assistant Freelio.

## 5. Design UI (React Email)
- **Base** : Container centré, Logo Freelio discret.
- **Font** : Sans-serif système pour une compatibilité maximale (iOS/Outlook).
- **Style** : Boutons indigo (`primary`), textes gris sombres, footer avec adresse de désinscription et mentions légales entreprise.
