# Refus métier et reprise de la recette navigateur

Les [diagnostics précédents](../20261022-postgres-compatibility/README.md) distinguent les réussites SQL/Linux des échecs navigateur. Les logs de `9f09bd5` consignent 33 échecs sur deux surfaces avant l’échéance des jobs ; `6274f54` confirme cinq échecs mobiles avant son arrêt volontaire. Les cas restants ne sont pas qualifiés.

## Corrections

Le commit `3906b88` ajoute une frontière de résultats aux mutations Chantiers et aux deux actions Service concernées. Next.js masque les exceptions serveur en production : les messages métier connus sont renvoyés explicitement et traités comme des refus dans le formulaire. Une saisie refusée ne déclenche ni fermeture ni notification de succès. Les mutations internes conservent leurs exceptions, transactions, droits et audits. Les erreurs SQL inattendues et objets inconnus restent protégés, sans sérialisation de leur contexte.

Le commit `8482182` corrige les scénarios : champs distincts de leur recherche, libellés obligatoires, article distinct de son aperçu et ouverture du fil sur mobile. Les préconditions Client/Site sont respectées ; un site incompatible bloque l’enregistrement. Les adresses de connexion fictives sont en minuscules. Le scénario Campagnes choisit sa séquence de diffusion et utilise une boîte configurée avec clés et plafonds fictifs, sans appel fournisseur. Les dates du planning restent vérifiées après son chargement, dans les deux fuseaux navigateur ; son squelette serveur possède une assertion de chargement distincte.

## Qualification locale

La [preuve](local.json) porte sur `84821820314fc2846bac3c43d5a277b869294e05` :

- **217 tests dans sept fichiers** réussis sur une SQLite fictive neuve, dont cinq nouveaux cas de transport et trois cas SQL de la frontière Chantiers : refus périmé, référence incohérente et rollback d’audit.
- Types, ESLint/Oxlint et build final Next.js 16.4.2 de **76 pages** réussis ; 1 261 fichiers de source et 710 versions installées comparés à Git et au lockfile.
- **518 cas Playwright dans 104 fichiers sélectionnés, sans exécution locale.** Syntaxe et lint ne remplacent pas leurs interactions.

Le seed UI local s’arrête sur son garde-fou de nom de base avant ses mutations ; la préparation et le seed initial de la base neuve ont réussi. Ce garde-fou reste intact. La CI doit exécuter sa recette prévue. Aucune nouvelle suite complète SQLite/PostgreSQL ni qualification Linux de ces commits n’est revendiquée ici.

Pour reproduire la suite ciblée, préparer une base fictive neuve dans une copie installée et lancer Vitest avec `--no-file-parallelism` sur `mutation-result`, `project-lifecycle-integrity`, `project-workspace-integrity`, `project-template-integrity`, `maintenance-settings-integrity`, `operations-details-relations` et `project-workspace-view`, avec leurs suffixes de fichiers. Exécuter types, lint et build séparément.

## CI de df22623

Le [run 39865613270](https://github.com/lacombechristophe/freelio/actions/runs/39865613270) est terminé. Sa [preuve compacte](ci-df22623.json) identifie le commit de branche et le merge temporaire testé, dont les arbres sont identiques.

- PostgreSQL : **72 migrations**, **3 933 tests réussis**, une exclusion propre à la sauvegarde SQLite ; aucun échec SQL.
- Chaque runner UI : **3 934 tests SQLite / 293 fichiers**, types, lint, couverture, build et audits npm réussis. Aucun avis de vulnérabilité signalé.
- Linux : les **neuf contrôles natifs** réussissent.
- Navigateurs : six échecs desktop et trois mobiles consignés ; les runners s’arrêtent à la limite de 45 minutes après **179/259** et **129/259** scénarios commencés. Ces nombres ne sont pas des nombres de réussites. Les scénarios restants ne sont pas qualifiés.
- Les uploads restent refusés pour quota GitHub. Ce run n’est pas une CI verte.

## Correctifs après ce run

Le candidat `64f8e7da0e4d6a09fffb21ba8b70eb64cab9508e` corrige le refus des créneaux invalides : les erreurs de validation des actions de création/replanification reviennent comme un message métier fixe, sans détails Zod. Les autres exceptions restent propagées. Les contrôles de droits, conflits, transactions et audits sont conservés.

La [recette locale](planning-local.json) reproduit d’abord deux échecs, puis passe **130 tests dans quatre fichiers**, dont deux nouvelles régressions couvrant quatre chemins invalides. Elle vérifie la conservation du créneau et l’absence de nouvelle écriture ou d’audit. Types, ESLint et build propre de 76 pages passent ; 1 261 fichiers de source sont comparés au commit, sans écart. Dépendances et schéma source restent inchangés.

Les scénarios utilisent désormais le libellé réel de l’équipement et le marqueur obligatoire du choix de commande. Le client hors page est recherché avant sélection. Le retour mobile depuis un brouillon vérifie la liste déjà ouverte, sans chercher un bouton réservé au détail du fil. Le conflit attend le message générique actuel, qui protège l’identité du dossier occupé ; le compteur vide d’achats attend « 0 résultats ».

Les actions navigateur sont bornées à 30 secondes, les navigations à 60 secondes ; le budget normal du scénario reste de quatre minutes. Le job dispose de 60 minutes pour inclure préparation, installation de Chromium et audit des routes. Les **518 cas / 104 fichiers** restent sélectionnés, sans exécution locale. Ces changements ne suppriment aucune assertion ni contrôle CI.

## Livraison

La CI du nouveau candidat reste requise. Le propriétaire poursuit sans navigateur local : migrations distantes et recette authentifiée de la preview restent non vérifiées. Main, production, offre GitHub, visibilité, licence et budget sont inchangés.
