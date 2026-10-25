# Démonstration publique — 25 octobre 2026

Code qualifié : `745c51db80464fa386b7abec90d6c9c7a5f4a647`. Déploiement Preview : `dpl_GMcHzpUT4a4nYP6FYTYzmqucWMxZ`. Adresse : https://freelio-demo-77c40cf.vercel.app. Le nom de cette adresse est historique ; l’en-tête `X-Freelio-Revision` identifie la version servie.

La [CI complète](ci-745c51d.json) réussit ses quatre jobs. Chaque suite SQL compte 4 142 réussites et une exclusion propre au moteur ; les parcours desktop comptent 260 réussites et une exclusion, mobile 243 et 18 exclusions. Le runtime Linux passe neuf contrôles. L’arbre du commit de fusion testé est identique à celui du candidat. Types, linters, couverture, build et audits npm passent dans ces jobs.

Les [précontrôles](schema-preflight.json) valident les 73 migrations présentes et les deux index manquants sur la seule base fictive dédiée. Les index sont [testés dans une transaction annulée](schema-rollback-test.json), puis [appliqués avec Prisma](schema-upgrade.json). Les 75 noms/checksums, les définitions d’index, les anciennes entrées et les permissions contrôlées du lecteur sont relus. Aucune donnée métier ni permission nouvelle n’est ajoutée par ce lot.

Les [dix sondes HTTP](http.json) réussissent, dont six refus d’écriture, d’intégration ou d’export. Les [contrôles Chrome sur l’origine du déploiement](staged-browser.json) vérifient connexion normale, tableau de bord, clients, devis, détail, PDF et factures. Une redirection vers l’ancien alias fait initialement perdre la session entre les deux hôtes ; les identifiants ne sont pas réinitialisés. Après [bascule de l’alias](alias.json), la [recette publique](public-browser.json) confirme connexion directe, facture, PDF, dépenses avec commandes désactivées, déconnexion et refus de l’accès au tableau de bord après celle-ci.

Les tests navigateur hébergés de ce dossier sont manuels et desktop. La couverture mobile vient de la CI du même code, avec ses fixtures isolées ; elle ne qualifie pas le rendu mobile hébergé. Aucune écriture métier ni sortie fournisseur n’est demandée. Les mots de passe, cookies et chaînes SQL ne sont pas conservés dans ces rapports.

La [protection de main](branch-protection.json) impose les quatre contrôles GitHub Actions, même à l’administrateur, avec branche à jour ; les push forcés et la suppression sont interdits. Ce reçu décrit un réglage distant, pas un fichier de configuration appliqué automatiquement.

Cette livraison concerne l’alias de démo du candidat. La fusion sur main et un build avec les variables Production restent des étapes distinctes. Le service demeure une démonstration sans stockage persistant de fichiers, avec données fictives et budget de 0 € ; elle ne qualifie ni les comptes OAuth/mail réels, ni une disponibilité contractuelle, ni la récupération de l’hébergeur.
