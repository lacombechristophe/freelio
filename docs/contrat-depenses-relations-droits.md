# Dépenses : relations historiques entre sociétés

## Défaut reproduit

Une recette SQLite fictive sur le code de `021bfac` passe son témoin cohérent et échoue sur six cas : le lecteur restitue une dépense liée à un client étranger et une autre liée à un chantier étranger ; une création accepte un chantier de la société dont le client est étranger ; modification, justification et suppression acceptent une ancienne dépense liée à ce client étranger.

Les permissions Finance existent déjà. Ce diagnostic utilise Owner pour isoler la validation des relations ; il ne prouve pas une absence générale de contrôle de rôle. Authentification et cache Next sont simulés, mais adhésion, action, DAL, audit et lignes SQL sont réels. Aucun fournisseur, justificatif réel ou base hébergée n'est utilisé.

## Correction approuvée

- Exclure des listes les dépenses dont le client ou le chantier appartient à une autre société, ainsi que les chantiers dont le client est étranger. Conserver les dépenses cohérentes sans rattachement optionnel ; les restrictions d'agence du DAL restent appliquées.
- Refuser modification, justification et suppression d'une dépense historique incohérente avec « Dépense introuvable », avant mutation, retrait de fichier et audit. Ne pas réparer implicitement ses relations pendant une autre sauvegarde.
- Refuser la création via un chantier dont le client est étranger avec « Chantier introuvable ou inaccessible », sans création ni audit.
- Conserver les parcours cohérents, les droits Finance et les agences. Aucun bouton, champ, couleur ou emplacement ne change.

Le propriétaire approuve ce lot le 10 octobre 2026. Le même prédicat société/client/chantier protège la liste, la lecture préalable et les écritures conditionnelles. Si une relation devient étrangère après la lecture, l'écriture refuse aussi l'opération avant audit ou retrait du justificatif. Le correctif Organisation et ses CI restent un lot distinct.

## Vérification

`tests/unit/expense-relations.integration.test.ts` couvre 28 cas avec les vraies actions, adhésions, DAL et lignes SQL : lectures Owner/Admin/Comptabilité/Viewer, trois types de relation incohérente, création, trois mutations, permissions Finance, révocation d'agence et démo publique. Trois cas changent le client entre la lecture préalable et l'écriture pour vérifier le refus conditionnel. Les refus conservent la dépense et son justificatif sans nouvel audit ni retrait de fichier. Authentification, cache Next et suppression de fichier sont simulés ; aucune pièce réelle n'est utilisée.

`tests/e2e/expense-relations.spec.ts` couvre Owner, Comptabilité et Viewer sur ordinateur et mobile. Il vérifie l'absence des références étrangères dans le HTML serveur et la page, conserve la dépense accessible et justifie celle-ci avec Comptabilité. Le seed dédié reste réservé à la recette isolée. Le chargement des six tests ne vaut pas exécution navigateur ; les résultats locaux et CI sont consignés séparément.

La garde des écritures existantes ne constitue pas une contrainte relationnelle universelle en base. La création conserve sa validation préalable ; ce lot ne qualifie ni toutes les relations d'intervention, ni une charge concurrente hébergée, ni le stockage réel des justificatifs.

La [recette locale](evidence/20261010-preview-readiness/expense-relations-local.json) passe les 28 cas dédiés puis 1 700 tests / 193 fichiers, types, deux lints et build. Le seed passe sur SQLite neuve ; les six E2E se chargent. Les preuves PostgreSQL et navigateur du nouveau candidat restent distinctes de ces résultats locaux.

Reproduction sur une base de recette isolée préparée :

```sh
npx vitest run tests/unit/expense-relations.integration.test.ts tests/unit/expense-permissions.test.ts --no-file-parallelism
npx playwright test tests/e2e/expense-relations.spec.ts
```
