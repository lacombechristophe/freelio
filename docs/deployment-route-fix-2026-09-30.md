# Correction des pages exclues du déploiement — 30 septembre 2026

## Cause et correction

`/dashboard/data` existait dans le dépôt mais renvoyait une 404 en production.
La règle non ancrée `data/` de `.vercelignore` excluait aussi
`src/app/dashboard/data/page.tsx`. Elle est remplacée par `/data/` pour exclure
uniquement le dossier de données locales à la racine.

Aucune modification du design ou du contenu des pages. Les modifications locales
préexistantes sont conservées. Le dossier temporaire `tmp/**` est également exclu
du lint : ses scripts de capture CommonJS faisaient échouer la vérification globale.
Les règles du code applicatif restent inchangées.

## Vérifications

- Aucune des 88 pages locales exclue par les règles de publication ;
  `data/private.json` reste exclu.
- `npm run verify` réussi : typage, lint, 349 tests dans 81 fichiers et build.
  Vérification locale avec SQLite ; build Vercel avec le client PostgreSQL.
- Build Vercel : `/dashboard/data` figure désormais dans la liste des routes.
- Après publication, les 43 destinations distinctes de navigation redirigent
  les visiteurs non connectés vers `/auth/login` (HTTP 307), sans 404.
- `/api/health/live`, `/api/health/ready` et `/auth/login` : HTTP 200.
- `/dev/design-system` : HTTP 404, comme prévu en production.

Ces contrôles ne valident pas les opérations métier après connexion, ni les
imports réels HubSpot/Extrabat dont les exports restent à fournir ultérieurement.

## Publication

- Production : https://freelio-eight.vercel.app
- Déploiement : `dpl_ACye9Ba7phAXMBsQ2B388XkR4hbj` (Ready).
- Version immuable : https://freelio-oork37jxb-hyhyhyhyhytest-8931s-projects.vercel.app
- Version précédente : `dpl_7VnrdT1LZnFYSY4p8b3i7fdy2eXz`.
- Publication depuis le répertoire de travail, sans commit global ni push des
  modifications préexistantes de la refonte.
