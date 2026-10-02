# Carte des risques et preuves

Les fichiers ci-dessous donnent des points d’entrée pour une revue technique. Leur présence n’est pas leur résultat : les exécutions courantes et leurs limites sont dans le [suivi CTO](execution-cto-20261001.md). Les tests mocks vérifient une branche de code ; les tests d’intégration SQL et Chromium ajoutent des preuves sur les composants réels.

| Risque / invariant | Preuves à examiner | Portée restante |
| --- | --- | --- |
| Isolation entreprise, agence et droits lecture/écriture | `tenant-scope.test.ts`, `agency-access.test.ts`, `permissions.test.ts`, `commercial-read-permissions.test.ts`, `expense-permissions.test.ts` | Revue complète des entrées HTTP/actions et des nouveaux modèles |
| Identifiants, MFA, sessions et tokens | `password.test.ts`, `mfa.test.ts`, `password-reset-token.test.ts`, `route-auth.test.ts`, `consent-token.test.ts`, inscription/connexion E2E | Limiteur distribué réel, reverse proxy, TLS et révocation multi-instance |
| Numérotation concurrente et calcul en centimes | `numbering.test.ts`, `document-numbering-core.test.ts`, `commercial-calculation.test.ts` | Stress concurrent et bornes sur le runtime final |
| Immutabilité d’une facture émise | `issued-invoice.integration.test.ts`, `issued-invoice.test.ts`, `docgen-worker-status.test.ts`, `portal-invoice-archive.test.ts`, `document-studio-archive.test.ts` | Course émission/queue avec Redis réel ; volumes d’archives |
| Rendu PDF, XML et ressources réseau | `pdf-generator.integration.test.ts`, `pdf-image-security.test.ts`, `invoice-pdf-route.test.ts`, `facturx.test.ts`, `verify-runtime-pdf.mjs` | Sandbox et ressources Linux ; aucune certification PDF/A-3 ou Factur-X globale |
| Import, reprise et rapprochement | `migration-database.integration.test.ts`, `migration-resume.integration.test.ts`, `migration-artifact-route.integration.test.ts` | Export réel fournisseur, gros volumes et arrêt brutal pendant commit |
| Sauvegarde et récupération | `backup-export.integration.test.ts`, `backup-scheduler.test.ts`, `backup-integrity.test.ts`, `verify-postgres-recovery.mjs` | Copie indépendante R2 + coffre des clés + restauration hébergée |
| Versions des scénarios JSONB | `workflow-publication.integration.test.ts` | Publications simultanées et conflits d’édition |
| Arrêt et exclusion des processeurs | `periodic-processor.test.ts`, `processor-lease.integration.test.ts`, `redis-connection.test.ts`, `verify-container-runtime.mjs` | Redis TLS hébergé, reprise d’un job après SIGKILL, tâche générique dépassant son lease |
| Démo publique et sorties externes | `public-demo.test.ts`, `public-demo-database.integration.test.ts`, `public-demo-network.test.ts`, `verify-demo-reader.mjs`, `verify-public-demo.mjs` | Pare-feu réseau de l’hébergeur, limiter distribué et saturation PDF/logs |
| Chaîne de livraison | Lockfile, audit npm, `check-publication.mjs`, `fingerprint-source.mjs`, `verify-container-runtime.mjs`, CI, Dockerfile | CI sur SHA candidat, qualification hébergée, revue effective des licences/assets |
| Accessibilité et usage | Parcours E2E, `full-ui-audit.spec.ts`, navigation clavier et mobile | Audit manuel représentatif et correction visible soumise à approbation |

Les noms de tests unitaires sont relatifs à `tests/unit/`. Un résultat local ne se transpose pas automatiquement à un fournisseur, à un volume supérieur ou à une infrastructure distante. Chaque affirmation de démonstration doit citer une recette datée et une version du code.
