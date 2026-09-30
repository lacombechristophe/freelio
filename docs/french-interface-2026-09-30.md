# Harmonisation du vocabulaire — 30 septembre 2026

Corrections ciblées sur le design existant, suivant les principes Karpathy :
pas de changement des URL, modèles Prisma, identifiants d’événements ou valeurs
persistées ; pas de renommage des contenus personnalisés des entreprises.

## Intitulés

- Workflow → scénario (menus, éditeur, journal, messages et aides).
- Pipeline → cycle de vente ; valeur du pipeline ouvert → affaires en cours.
- Scoring → qualification.
- Forecast → prévisions.
- Reporting → rapports.
- Onboarding → configuration initiale.

Les synthèses traduisent également les statuts techniques des prospects, tâches,
campagnes, scénarios, devis et tickets SAV. Les déclencheurs de scénarios affichés
dans la synthèse marketing réutilisent les traductions de l’éditeur.
Les noms officiels de services et les contenus saisis par les utilisateurs restent
inchangés, y compris les noms de cycles de vente déjà enregistrés.

## Vérifications

- `npm run verify` réussi : typage, lint, 358 tests dans 82 fichiers, build.
- Deux parcours Playwright réussis, ordinateur et mobile, avec le compte QA de
  la base locale de recette : ventes, qualification, scénarios, CRM, synthèse
  commerciale, synthèse marketing et service. Vérification des intitulés,
  absence des principaux codes techniques et absence de débordement horizontal.
- Sélecteurs des tests existants ajustés aux nouveaux intitulés, sans modifier
  leurs actions ni leurs assertions métier. La suite E2E complète n’a pas été
  rejouée pour cette correction de langue.
- Les contenus personnalisés/importés et toutes les combinaisons de données ne
  constituent pas une couverture exhaustive de cette recette.

## Publication

- Déploiement de production Ready : `dpl_C5zdpgBSFDcZ3mKUxSqyBk9g18uv`.
- Alias : https://freelio-eight.vercel.app
- Publication du répertoire de travail conservant la refonte préexistante,
  sans commit global ni push de ces changements locaux.
