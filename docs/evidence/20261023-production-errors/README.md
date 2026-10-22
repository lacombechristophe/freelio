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

## Livraison

La CI du nouveau candidat reste requise. Quota d’artefacts et refus APT du précédent runner restent distincts ; aucun contrôle n’est ignoré. Le propriétaire poursuit sans navigateur local : migrations distantes et recette authentifiée de la preview restent non vérifiées. Main, production, offre GitHub, visibilité, licence et budget sont inchangés.
