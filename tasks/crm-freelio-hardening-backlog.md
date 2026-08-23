# Backlog objectif - CRM Freelio production hardening

Date de demarrage : 2026-06-23

## Etat initial verifie

- Smoke test navigateur sur 23 routes dashboard accessibles : OK.
- Pas de page blanche, overlay framework visible ou erreur console sur ces routes.
- Donnees locales disponibles : 2 clients, 1 projet, 1 devis, 1 facture, aucun contrat.
- `npx tsc --noEmit`, lint cible select, Vitest et build etaient OK apres le correctif select precedent.

## P0 - Bloquants

Aucun P0 global detecte au smoke route initial.

Points a surveiller encore :

- workflows de creation/edition/suppression a tester action par action ;
- creation et signature de contrat avec donnees reelles ;
- generation PDF sur les documents nouvellement crees ;
- comportement mobile et clavier.

## P1 - Important

### P1-001 - Dashboard : boutons d'actions rapides non relies

- Statut : corrige et verifie.
- Surface : `/dashboard`
- Evidence : `src/app/dashboard/page.tsx`
- Symptome : `Tout voir`, `Nouveau Devis`, `Creer Facture` sont des boutons visuellement actifs mais sans navigation/action.
- Impact : un debutant clique sur des CTA principaux et rien ne se passe.
- Correction cible : transformer ces boutons en liens vers `/dashboard/notifications`, `/dashboard/devis/new`, `/dashboard/factures/new`.

### P1-002 - Temps : bouton Exporter sans handler

- Statut : corrige et verifie.
- Surface : `/dashboard/temps`
- Evidence : `src/app/dashboard/temps/temps-view.tsx`
- Symptome : le bouton `Exporter` est visible dans l'historique mais ne fait rien.
- Impact : impossible de sortir facilement ses heures, alors que c'est un besoin metier direct.
- Correction cible : export CSV client-side des entrees visibles.

### P1-003 - Parametres : export RGPD retourne des donnees mais promet un email

- Statut : corrige et verifie.
- Surface : `/dashboard/settings`
- Evidence : `src/actions/compliance/index.ts`, `src/app/dashboard/settings/settings-client.tsx`
- Symptome : `exportUserData()` retourne un JSON, mais l'UI ignore le resultat et affiche "Vous recevrez un e-mail."
- Impact : promesse produit fausse et export inutilisable immediatement.
- Correction cible : telecharger un JSON localement et afficher un message exact.

### P1-004 - Depenses : fonctionnalites annoncees "a venir"

- Statut : corrige et verifie.
- Surface : `/dashboard/depenses`
- Evidence : `Scanner un ticket (AI)`, `Categories`
- Symptome : boutons visibles qui affichent seulement un toast "a venir".
- Impact : donne l'impression d'un produit incomplet.
- Correction appliquee : `Scanner un ticket (AI)` ouvre le formulaire OCR existant ; `Categories` est remplace par une indication non cliquable.

### P1-005 - Facturation : conformite et e-invoicing a consolider

- Statut : corrige pour le socle PDF actuel, audit e-invoicing avance a surveiller.
- Surface : devis/factures/PDF/settings
- Evidence : schema contient Factur-X/e-invoice, templates PDF, mentions legales.
- Risque : les mentions, seuils, taux et obligations peuvent changer ; ne pas presenter comme juridiquement certifie sans verification officielle.
- Correction appliquee : mention franchise TVA PDF datee ; `293 B du CGI` avant le 2026-09-01, mention CIBS a partir du 2026-09-01.
- Correction appliquee : microcopy settings TVA rendue non figee sur `293 B` ; le PDF choisit la mention selon la date du document.
- Verification templates : generation et inspection visuelle des trois modeles `MINIMAL`, `PROFESSIONAL`, `MODERN` sur `FACT-2026-001`; pas de chevauchement, colonnes lisibles, hierarchie correcte.
- Reste : suivi legal/e-invoicing 2026/2027 a maintenir ; ne pas presenter comme certification juridique.

### P1-006 - Numerotation facture/devis : le test ne couvre pas l'action reelle

- Statut : corrige et verifie.
- Surface : `src/actions/factures/index.ts`, `src/actions/devis/index.ts`, `src/actions/contrats/index.ts`, `src/lib/document-numbering.ts`, `tests/unit/numbering.test.ts`, `prisma/schema.prisma`
- Evidence : `createInvoice` et `createQuote` utilisent `last number + 1`, tandis que le test de numerotation cree ses propres numeros dans une transaction separee.
- Impact : risque de doublons en concurrence ou si deux creations partent du meme dernier numero.
- Correction appliquee : contraintes uniques Prisma `[companyId, number]` sur `Quote`, `Invoice`, `Contract`; retry serveur court sur conflit unique; conversion devis -> facture couverte par le meme helper; test remplace par un scenario de collision reelle.
- Verification : `npx prisma db push --accept-data-loss` applique apres verification sans doublons ; `npx tsc --noEmit`, lint cible et `npm test -- --run tests\unit\numbering.test.ts` OK.

### P1-007 - Contrats : rendu detail brut et variables cassees par autolink

- Statut : corrige et verifie.
- Surface : `/dashboard/contrats/new`, `/dashboard/contrats/[id]`, `/dashboard/contrats/[id]/sign`
- Evidence : `src/components/contracts/tiptap-editor.tsx`, `src/actions/contrats/index.ts`, `src/lib/contracts/html.ts`, `src/app/dashboard/contrats/[id]/page.tsx`
- Symptome : le detail dashboard affichait le HTML Tiptap brut (`<p>...`) ; les variables comme `{{client.name}}` pouvaient etre transformees en lien `http://client.name`, empechant la compilation.
- Impact : contrat peu professionnel et variables de fusion non fiables.
- Correction appliquee : autolink Tiptap desactive dans l'editeur contrat ; normalisation des variables linkifiees ; rendu HTML restreint/sanitise sur detail dashboard et page signature ; test unitaire du helper HTML.
- Verification navigateur : creation contrat temporaire, navigation detail, variable compilee en `Digi-Image`, passage `SENT`, suppression via confirmation, retour liste ; aucun overlay ni erreur console. Contrat temporaire supprime de la base.
- Verification commande : `npx tsc --noEmit`, lint cible contrats, `npm test -- --run tests\unit\numbering.test.ts tests\unit\contract-html.test.ts` OK.

## P2 - Finition

### P2-001 - Encodage terminal apparent

- Evidence : PowerShell affiche des accents en mojibake dans plusieurs fichiers.
- Impact probable : faible si le navigateur affiche correctement, mais a surveiller si des chaines sont reellement corrompues.

### P2-002 - Dashboard : contenu parfois trop editorial

- Surface : `/dashboard`
- Symptome : certaines microcopies sont plus marketing que productives.
- Impact : outil metier moins direct.
- Correction cible : microcopy plus sobre, orientee action.

## Validation finale du lot objectif

- `npx tsc --noEmit` : OK.
- `npm test -- --run` : OK, 2 fichiers / 4 tests.
- `npm run build` : OK, Next.js 16.2.3 compile et genere les routes.
- `npx eslint` : OK sans erreur bloquante ; 8 warnings `no-unused-vars` restants.
- Smoke navigateur integre sur 23 routes dashboard : OK, pages non blanches, pas d'overlay, pas de console error/warn pertinente.
- QA PDF : apercus PNG hors repo dans `%TEMP%\freelio-pdf-qa` pour `MINIMAL`, `PROFESSIONAL`, `MODERN`.
