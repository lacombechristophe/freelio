# Templates PDF Freelio

## Architecture

- Le HTML est généré par les renderers TypeScript de `src/lib/pdf/` puis imprimé en A4 avec Puppeteer.
- Source Sans 3 porte la lecture fonctionnelle ; Source Serif 4 intervient uniquement dans les titres éditoriaux et les montants du modèle Éditorial.
- Les polices sont incorporées en base64 avant impression pour garantir un rendu identique dans les routes HTTP et le worker BullMQ.
- Le devis, la facture et le contrat utilisent les mêmes données d’entreprise : logo, coordonnées, SIRET, TVA, APE, RCS et identité légale.

## Modèles de devis et facture

- **Éditorial (`MINIMAL`)** : grande respiration, titre serif, règles fines et montant traité comme une information éditoriale.
- **Registre (`PROFESSIONAL`)** : synthèse B2B structurée, grille de métadonnées, tableau dense et total fortement cadré.
- **Signature (`MODERN`)** : en-tête coloré léger, montant prioritaire sur fond encre et tableau contemporain.

Chaque modèle conserve les mêmes garanties fonctionnelles : tableau répétable sur plusieurs pages, bloc d’acceptation ou de paiement, totaux, références et mentions légales en pied de page fixe.

## Contrat

Le contrat utilise une composition dédiée : parties clairement identifiées, clauses numérotées, dates d’effet, bloc de signatures et identité d’audit du signataire. Une signature manuscrite valide est rendue lorsque son image est disponible.

## Factur-X

Les factures reçoivent un fichier `factur-x.xml` généré depuis les données vendeur, acheteur, lignes, TVA et totaux. L’attachement XML est conservé dans le PDF par `pdf-lib`.

Point de conformité : cette étape d’attachement ne suffit pas, à elle seule, à certifier un fichier PDF/A-3 ou un profil Factur-X complet. Une validation externe dédiée reste nécessaire avant de présenter le document comme certifié conforme.

## Contrôle qualité

La campagne de rendu couvre les trois modèles en devis et facture, en version standard et longue, ainsi que le contrat standard et signé long. Les contrôles portent sur la pagination A4, les débordements, les tableaux multipages, les pieds de page, la typographie et les blocs de signature/paiement.
