# Qualification du candidat Freelio

État du 13 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Main, preview de branche et production sont des références distinctes.

## Dernier code entièrement qualifié

`12d3aa7fb64ff19d70257c89edc4f0230537440f` protège aussi l'aperçu initial des temps avant le clic. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38394310079) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38394315597) réussissent tous leurs jobs. Les [rapports](evidence/20261013-candidate/ci-12d3aa7.json) conservent le merge réellement testé et les nouveaux cas. Le choix Client Chantiers, approuvé ensuite, est un lot distinct en qualification.

| Contrôle | Résultat disponible |
| --- | --- |
| Local : types, ESLint, Oxlint, build | Réussis |
| SQLite avec couverture | 2 030 tests / 207 fichiers réussis |
| PostgreSQL (deux artefacts contrôlés) | 2 029 réussis et une exclusion native SQLite ; les 21 nouveaux cas d'aperçu initial passent sans exclusion |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Navigateur compilé | 363 réussis, 19 exclusions historiques dans chaque CI ; 16 parcours Finance/PDF et six parcours d'imputation réussis |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de ce candidat | 49 pages/onglets sur chaque surface, zéro erreur JavaScript, retry ou exclusion |

La [recette hébergée](evidence/20261013-candidate/hosted-12d3aa7.json) contrôle `dpl_BkuN2TTg6q5WVkGMDvuU54H2Hdxd`, avec harnais et alias vérifiés. L'[identité du code](evidence/20261013-candidate/source-12d3aa7.json) compare 1 021 entrées Git hors `docs/` avec le merge PR `e836785bb57778f057805c7c8fed6c93f9168d70`. Cette recette en lecture seule ne prouve pas les mutations ; celles du lot initial sont vérifiées séparément dans les deux navigateurs compilés. La [migration de l'index](evidence/20261013-time-invoice-release/preview-index-upgrade.json) reste datée et additive, sans modification métier ni privilège lecteur supplémentaire. Le contrôle de version de l'aperçu ne nécessite aucune migration.

## Échecs précédents conservés

Les deux CI du commit de documentation `06d0d7c` sont rouges : 360 parcours réussis, 19 exclusions historiques et un sélecteur de tâche ambigu dans chaque run. PostgreSQL et Linux passent. Le [rapport](evidence/20261013-browser-navigation/ci-06d0d7c.json) conserve cet échec malgré le même code applicatif que a055d65. Le correctif de ce sélecteur et celui de l'aperçu initial passent ensuite dans les deux CI de 12d3aa7 ; le rapport rouge reste conservé.

Les deux CI de `1586c1b` sont **annulées au plafond de 35 minutes** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38317716890), [PR](https://github.com/lacombechristophe/freelio/actions/runs/38317721467). SQLite : 1 944 réussis. PostgreSQL : 1 943 réussis et une exclusion native SQLite. Neuf contrôles Linux et deux audits sans vulnérabilité passent dans chaque run. La suite navigateur reste incomplète, avec quatre échecs desktop de facturation et un timeout d'automatisation.

Les [traces et corrections de sélecteurs](evidence/20261013-browser-navigation/README.md) expliquent ces échecs : l'attente de navigation acceptait la page initiale des temps non facturés ; une carte de calendrier était sélectionnée à la place de la carte contenant l'action de tâche. Toutes les assertions métier restent actives. Aucun timeout, audit ou seuil n'est assoupli.

La preview de `1586c1b`, `dpl_5p26BocxT54MANumDFUPCHXB2xLF`, réussit 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ou exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. Son résultat ne couvre pas les mutations des nouveaux lots. L'identité du code hors `docs/` est comparée au merge réellement testé par la CI PR.

## Correctifs récents

| Invariant | Preuves et périmètre |
| --- | --- |
| Une tâche ne produit qu'un temps ; tâche, budget et temps restent atomiques | [Organisation](evidence/20261012-task-time-imputation/README.md) : 34 cas SQL, six E2E. Association historique jamais déduite d'un titre. |
| Comptabilité peut facturer un temps accessible sans droit général Opérations | [Rattachement au nouveau brouillon](evidence/20261013-time-billing-accounting/README.md) : autorisation limitée au seul `invoiceId`, 30 cas SQL. |
| Facturer les secondes exactes, avec le même arrondi dans l'aperçu et la facture | [Calcul](evidence/20261013-time-invoice-rounding/README.md) : deux minutes à 100 €/h donnent 3,33 € regroupées ou 3,34 € détaillées. Nouvelles quantités documentaires à six décimales ; archives anciennes conservées. |
| Refuser une préparation devenue périmée | [Snapshot transactionnel](evidence/20261013-time-invoice-snapshot/README.md) : 17 cas SQL, recontrôle Serializable, aucun nouveau brouillon ni rattachement après refus. |
| Refuser un aperçu devenu périmé avant le clic | [Version de l'aperçu initial](evidence/20261013-time-billing-ui/README.md) : 21 nouveaux cas SQL réussis localement et dans les deux rapports PostgreSQL ; deux E2E ordinateur/mobile réussis dans chaque CI de 12d3aa7. |
| Supprimer un brouillon accessible et libérer uniquement ses temps | [Libération](evidence/20261013-time-invoice-release/README.md) : 36 cas SQL, suppression, libération et audit atomiques. Documents émis protégés ; index additif, aucune réparation automatique des associations. |
| Un client étranger rend le document introuvable aussi par URL PDF | [Aperçus et téléchargements](evidence/20261013-document-preview-scope/README.md) : 29 cas SQL et deux E2E, refus avant rendu ou archive. |

Les accords visibles sont conservés dans leurs contrats. Les boutons, couleurs et dispositions ne sont pas redessinés par ces lots. Les preuves antérieures de [Dépenses](evidence/20261012-expense-project-selector/README.md), [écritures Temps](evidence/20261012-time-entry-integrity/README.md), [historique Temps](evidence/20261012-time-directory/README.md) et [Chantiers](evidence/20261012-project-directory/README.md) restent datées.

## Portée des preuves

Les suites SQL simulent l'authentification et le cache Next selon leurs fichiers ; elles utilisent les vraies actions, transactions et contraintes. Les suites fournisseurs décrivent leurs simulations HTTP. Les E2E compilés, les sondes hébergées et les tests SQL n'ont pas le même périmètre.

Les 19 exclusions historiques du navigateur correspondent à des mutations exécutées une fois sur bureau, une matrice de largeurs et des contrôles propres à une surface. Elles ne prouvent pas les mutations omises sur mobile. Aucun test des nouveaux lots Temps/Chantiers n'est retiré pour obtenir une CI verte. La [carte des preuves](carte-des-preuves.md) relie les risques aux suites.

## À terminer avant une affirmation plus large

- Relier toute nouvelle modification fonctionnelle à sa propre CI et sa propre recette ; les preuves ci-dessus qualifient 12d3aa7, pas une évolution future.
- Examiner les sélecteurs et chaînes métier restants du [plan](plan-completude-fonctionnelle-20261002.md), sans confondre liste récente volontairement bornée et portefeuille complet.
- Deux diagnostics Chantiers restent ouverts : [client absent au-delà de 1 000 choix](contrat-chantier-choix-client.md) et [compteur global de modèle](contrat-modeles-chantier-compteur.md). Le choix Client est approuvé et en qualification ; le compteur reste en attente d'accord. Leur [reproducteur SQL](evidence/20261013-project-choices/reproducer.test.ts.txt) et leurs [observations](evidence/20261013-project-choices/before.json) sont conservés.
- Qualifier stockage persistant, comptes fournisseurs, délivrabilité, charge et reprise après arrêt brutal avant usage commercial. Le budget actuel reste de 0 €.

L'[historique de qualification](historique-qualification-candidat-20261010.md) conserve les références antérieures et leurs échecs. Les [preuves du socle](execution-cto-20261001.md) et la [recette hébergée sans stockage](qualification-demo-sans-stockage-20261010.md) restent datées. Aucun compteur de tests, rendu de démo ou ancien déploiement ne certifie tout le logiciel.
