# Livraison de la démonstration — 25 octobre 2026

La [démonstration principale](https://freelio-eight.vercel.app) est une instance en lecture seule, avec des données fictives. La [PR #8](https://github.com/lacombechristophe/freelio/pull/8) est fusionnée sur main. La référence qualifiée lors de cette livraison est `a461e68cc0cb20effa5cabcbfa34fe54acf6a9b4`, arbre Git `6948a9861915bffdb05a65a564362f5f232c0677`.

Ce document décrit cette livraison datée. Une modification documentaire ultérieure peut avoir un autre SHA sans changer le code applicatif. Pour identifier la version effectivement servie, lire l’en-tête `X-Freelio-Revision` de `/api/health/ready` et les contrôles de la PR correspondante. Les reçus ci-dessous ne qualifient pas automatiquement un futur changement de code ou de dépendance.

## Code et vérification

La [CI après fusion](https://github.com/lacombechristophe/freelio/actions/runs/40188633508) réussit ses quatre jobs. Le [résumé](evidence/20261025-main-release/ci.json) et le [reçu de fusion](evidence/20261025-main-release/merge.json) identifient le code, l’arbre testé et les résultats :

| Contrôle | Résultat |
| --- | --- |
| SQLite | 4 142 réussites et une exclusion propre au moteur, sur chacun des deux jobs navigateur. |
| PostgreSQL | 4 142 réussites et une exclusion propre à SQLite. |
| Navigateur desktop | 260 réussites, une exclusion réservée à la navigation compacte. |
| Navigateur mobile | 243 réussites, 18 exclusions mutationnelles réservées au desktop. |
| Runtime Linux | Neuf contrôles : migrations, Prisma, sondes, arrêt du serveur et du worker, Redis, PDF et archive de contrat. |
| Qualité | Types, ESLint, Oxlint, couverture ciblée, build et audits npm réussis. |

Les deux exécutions SQLite ne sont pas additionnées. La couverture ciblée concerne les six modules configurés, pas toute l’application.

La première tentative de main a échoué pendant la fermeture du contexte Playwright, après les assertions du portail et le contrôle de console réussis. Sa cause profonde n’est pas établie. Une seule relance manuelle du job desktop réussit, sans modification de code, allongement de délai ou retrait d’assertion. Le [diagnostic initial](evidence/20261025-main-release/main-ci-attempt1-diagnostic.json) et les empreintes des traces sont conservés ; le succès suivant n’efface pas cet incident.

## Déploiement et consultation

L’artefact Production `dpl_Eq89NBbGYApsKVbKigxhsrEWSRhm` a été construit depuis cette référence de main, vérifié puis promu explicitement, sans nouvelle compilation pendant la promotion.

- Les [dix sondes publiques](evidence/20261025-main-release/http.json) passent. La disponibilité renvoie HTTP 200, avec base, schéma et configuration prêts et la révision Git attendue. Les écritures, processeurs, démarrages OAuth et exports sensibles sont refusés dans ce profil.
- La [recette Chrome du domaine principal](evidence/20261025-main-release/browser.json) vérifie la connexion normale du seul compte fictif autorisé, les six factures, leur détail et un PDF, puis la déconnexion et le refus d’une route protégée. Aucun identifiant ni cookie n’est conservé dans le reçu.
- La [recette sur l’origine du build](evidence/20261025-main-release/staged-browser.json) vérifie aussi les clients, Communications sans fournisseur, la liste Clients à 393 × 852 en émulation Chrome et la navigation compacte au clavier. Cette émulation ne qualifie pas un appareil physique ou Safari.
- Le [manifeste public](evidence/20261025-main-release/manifest.json) est servi sur la même origine, sans redirection vers le SSO de Vercel. La CSP n’a pas été élargie pour autoriser le SSO sur l’origine de qualification protégée.

La base dédiée possède 75 migrations vérifiées. Les deux derniers index ont d’abord été essayés dans une transaction annulée, puis appliqués avec Prisma. Les noms/checksums, l’ancien journal et les droits du lecteur ont été relus. Les [preuves de mise à niveau](evidence/20261025-public-demo/README.md) restent distinctes des tests sur bases neuves.

## Configuration et retour

Le stockage persistant est désactivé, sans R2. Les commandes métier et les sorties fournisseur sont bloquées côté serveur dans la démo publique. Les variables et l’artefact de production précédents sont conservés côté Vercel pour préparer un retour compatible. Les [réglages temporaires](evidence/20261025-main-release/settings.json) de création des previews et d’attribution des domaines sont rétablis après la recette.

Un retour utilise un artefact déjà construit avec sa propre configuration et une base compatible. Il ne consiste pas à reconstruire un ancien code avec les nouvelles variables ou à retirer les migrations de la démo. Cette livraison ne revendique pas un exercice de retour du trafic ni une mesure de RTO.

## Limites avant usage réel

Le profil livré convient à une présentation avec données fictives. Une exploitation commerciale exige encore la qualification des comptes mail/OAuth réels, du stockage durable, de la délivrabilité, de la charge et de la récupération de l’hébergeur. La [récupération native fictive](evidence/20261025-prisma7/README.md) porte sur un petit corpus sans trafic ; elle n’atteste pas un PRA hébergé. Aucun abonnement payant ni licence de redistribution du code propre n’est ajouté.

Les alertes de dépendances GitHub sont activées après cette livraison. Leur [observation datée et la revue des propositions](evidence/20261025-main-release/maintenance.json) complètent les audits npm ; elles ne garantissent pas l’absence de vulnérabilités inconnues. Les versions proposées par Dependabot gardent leur propre revue et leur CI.
