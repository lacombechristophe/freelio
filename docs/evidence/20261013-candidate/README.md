# Candidat 12d3aa7

Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38394310079) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38394315597) sont vertes : 2 030 tests SQLite, 2 029 PostgreSQL et une exclusion native SQLite ; 363 E2E et 19 exclusions historiques dans chaque run ; neuf contrôles Linux et deux audits sans vulnérabilité. Le [rapport](ci-12d3aa7.json) conserve les 21 nouveaux cas de version initiale et les deux parcours compilés de refus, saisie conservée et réussite après rechargement. Le test de fin de tâche d'Organisation passe aussi dans les deux runs.

L'[identité du code](source-12d3aa7.json) confirme 1 021 entrées hors documentation identiques au merge réellement testé. La [recette hébergée](hosted-12d3aa7.json) visite 49 pages/onglets par surface sans erreur JavaScript, retry ou exclusion ; harnais et alias sont vérifiés. Le [scan de publication](publication-12d3aa7.json) examine les signatures connues dans les sources et 3 734 objets Git, sans découverte. Ce sont des contrôles de démonstration fictive ; aucun compte fournisseur réel, stockage durable ou usage commercial n'est qualifié.

La qualification du choix Client Chantiers approuvé ensuite reste distincte. Le [compteur de modèle](../../contrat-modeles-chantier-compteur.md) attend encore son accord visible.

## Référence antérieure a055d65

Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38321815498) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38321819239) passent tous leurs jobs. Le [rapport](ci-a055d65.json) conserve SHA, parents, Node, identités des artefacts, neuf contrôles Linux et cas récents :

- SQLite avec couverture : 2 009 réussis / 206 fichiers.
- PostgreSQL : 2 008 réussis, une exclusion native SQLite.
- Navigateur compilé : 361 réussis et 19 exclusions historiques dans chaque run. Les vingt cas Finance/PDF et imputation récents passent sur ordinateur/mobile.
- Deux audits : zéro vulnérabilité dans chaque run.

L'[identité du code](source-a055d65.json) compare 1 018 entrées Git hors `docs/` avec le merge PR `521c0622f639544651398a52c7f26543c652745e`. Les changements de documentation suivants conservent ce code applicatif. Les [échecs de 1586c1b](../20261013-browser-navigation/README.md) restent documentés ; ils ne sont pas transformés en succès rétrospectif.

La [recette hébergée](hosted-a055d65.json) visite 49 pages/onglets sur chaque surface, sans erreur JavaScript, retry ou exclusion. Le harnais et l'alias sont vérifiés contre le déploiement exact. Compte Owner fictif, PostgreSQL lecteur et Upstash, stockage persistant désactivé : cette recette ne prouve pas les mutations. La [migration d'index](../20261013-time-invoice-release/preview-index-upgrade.json) s'applique seulement à la base fictive dédiée, sans modification métier ni privilège supplémentaire du lecteur.

Le [scan de publication](publication-a055d65.json) examine certaines signatures connues dans la copie de travail et 3 698 objets historiques, sans découverte. Sa portée ne constitue pas une garantie d'absence de tous les secrets possibles.

Deux autres diagnostics Chantiers restent ouverts, avec [preuves](../20261013-project-choices/before.json) : choix Client tronqué à 1 000 et compteur de modèle hors périmètre. Leurs modifications visibles sont proposées séparément. Les fournisseurs réels, la charge, le stockage durable et les incidents d'exploitation restent à qualifier ; aucun usage commercial n'est certifié par ces résultats.
