# Qualification du candidat Freelio

État du 13 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Main, preview de branche et production sont des références distinctes.

## Candidat en qualification

Le [lot Prospects entrants](evidence/20261013-lead-inbox/README.md), approuvé le 13 octobre, remplace les 150 dernières demandes par une recherche et pagination serveur sur tout le portefeuille. Les cartes portent sur toute la société ; la recherche et le filtre restent conservés lors d'une erreur ou actualisation. Le lecteur ne transmet plus les données commerciales inutilisées par l'écran. Les 36 contrôles SQL passent localement, avec typage, ESLint, Oxlint et vérification des deux fixtures de 151 demandes. Les deux nouveaux parcours compilés sont définis ; leur CI exacte et la lecture hébergée restent requises après publication.

## Dernier code entièrement qualifié

`8d7b234857d9568621d65b7464b4730f867cea65` ajoute les relations Portail, le compteur Modèles, le choix Client complet Documents/Affaires et les relations cohérentes des Affaires. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38445126803) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38445134947) passent. La branche a nécessité la relance du seul job Linux après un HTTP 429 du registre ECR ; les tests réussis ne sont pas relancés.

| Contrôle | Résultat du candidat 8d7b234 |
| --- | --- |
| Types, ESLint, Oxlint et build | Réussis dans les deux CI |
| SQLite avec couverture | 2 148 tests / 212 fichiers réussis dans chaque CI |
| PostgreSQL | 2 147 réussis et une exclusion native SQLite ; les 92 nouveaux cas des quatre lots passent sans exclusion |
| Navigateur compilé | 383 réussis et 19 exclusions historiques dans chaque CI ; les 14 nouveaux parcours passent |
| Image Linux | Neuf contrôles réussis dans les deux CI, avec les tentatives conservées |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de 8d7b234 | 49 pages/onglets par surface, zéro erreur JavaScript, retry ou exclusion |

Les [preuves CI](evidence/20261013-candidate/ci-8d7b234.json), l'[identité du code](evidence/20261013-candidate/source-8d7b234.json) et la [recette hébergée](evidence/20261013-candidate/hosted-8d7b234.json) sont conservées. Les 1 039 entrées Git hors `docs/` correspondent au merge PR testé `658051b044f5f85f86099af7185b4e63b98a5fa4`. Le harnais et l'alias correspondent au déploiement `dpl_7QmFQGtGwKL34vHZPKjS7vPpCTdv`. La lecture hébergée ne qualifie pas les mutations ; celles-ci sont testées séparément dans la recette compilée.

Les [échecs de c5d1191](evidence/20261013-document-client-choices/ci-regressions.md) restent conservés : validation sans client et saisie avant hydratation. Leur correction garde les assertions et délais. Les suites complètes locales précédentes atteignent des délais sur des cas préexistants, tandis que leurs rejeux isolés passent ; ces limites ne sont pas présentées comme un passage local de couverture. Elles sont conservées dans les [preuves Affaires](evidence/20261013-pipeline-relations/README.md).

## Référence précédente

`19502a6c38784c6510aae8df365a2631bcaeb85b` ajoute le choix Client complet des Chantiers, sa reprise après disparition du client et le bouton de facturation des temps désactivé en démo publique. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38405043599) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38405049561) réussissent tous leurs jobs. Les [rapports](evidence/20261013-candidate/ci-19502a6.json) relient les nouveaux cas au merge réellement testé.

| Contrôle | Résultat disponible |
| --- | --- |
| Local : types, ESLint, Oxlint, build | Réussis ; première suite locale en échec conservée, puis relance séparée sans délai modifié |
| SQLite avec couverture | 2 056 tests / 208 fichiers réussis dans les deux CI |
| PostgreSQL (deux artefacts contrôlés) | 2 055 réussis et une exclusion native SQLite ; 26 cas de choix Client et 21 d'aperçu initial passent sans exclusion |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Navigateur compilé | 369 réussis, 19 exclusions historiques dans chaque CI ; les six nouveaux parcours Client passent sur ordinateur/mobile |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de ce candidat | 49 pages/onglets sur chaque surface, zéro erreur JavaScript, retry ou exclusion |

La [recette hébergée](evidence/20261013-candidate/hosted-19502a6.json) contrôle `dpl_mDjJeR3f2DdfxV35JBRKMRgrztPp`, avec harnais et alias vérifiés. L'[identité du code](evidence/20261013-candidate/source-19502a6.json) compare 1 024 entrées Git hors `docs/` avec le merge PR `eb06c3562722331b792223b0d747def186f35703`. La consultation hébergée ne prouve pas les mutations ; le navigateur compilé vérifie séparément création, édition, panne et remplacement d'un client supprimé. Les gardes serveur de la démo restent actives. La preview ne contient pas de temps sélectionnable : elle ne prouve pas un clic de facturation publique avec une sélection remplie.

La [qualification de 12d3aa7](evidence/20261013-candidate/ci-12d3aa7.json) conserve l'aperçu initial et les contrôles de facturation ; la [migration d'index](evidence/20261013-time-invoice-release/preview-index-upgrade.json) reste datée et additive, sans modification métier ni privilège lecteur supplémentaire. Les nouveaux choix et marqueurs d'affichage ne nécessitent aucune migration.

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
| Choix Client Chantiers complet et récupérable | [Choix Client](evidence/20261013-project-client-choices/README.md) : 26 cas SQL et six E2E réussis dans les deux CI de 19502a6. Client séparément vérifié, champs conservés et choix disparu remplaçable. |
| Refuser un aperçu devenu périmé avant le clic | [Version de l'aperçu initial](evidence/20261013-time-billing-ui/README.md) : 21 nouveaux cas SQL réussis localement et dans les deux rapports PostgreSQL ; deux E2E ordinateur/mobile réussis dans chaque CI de 12d3aa7. |
| Supprimer un brouillon accessible et libérer uniquement ses temps | [Libération](evidence/20261013-time-invoice-release/README.md) : 36 cas SQL, suppression, libération et audit atomiques. Documents émis protégés ; index additif, aucune réparation automatique des associations. |
| Un client étranger rend le document introuvable aussi par URL PDF | [Aperçus et téléchargements](evidence/20261013-document-preview-scope/README.md) : 29 cas SQL et deux E2E, refus avant rendu ou archive. |

Les accords visibles sont conservés dans leurs contrats. Les boutons, couleurs et dispositions ne sont pas redessinés par ces lots. Les preuves antérieures de [Dépenses](evidence/20261012-expense-project-selector/README.md), [écritures Temps](evidence/20261012-time-entry-integrity/README.md), [historique Temps](evidence/20261012-time-directory/README.md) et [Chantiers](evidence/20261012-project-directory/README.md) restent datées.

## Portée des preuves

Les suites SQL simulent l'authentification et le cache Next selon leurs fichiers ; elles utilisent les vraies actions, transactions et contraintes. Les suites fournisseurs décrivent leurs simulations HTTP. Les E2E compilés, les sondes hébergées et les tests SQL n'ont pas le même périmètre.

Les 19 exclusions historiques du navigateur correspondent à des mutations exécutées une fois sur bureau, une matrice de largeurs et des contrôles propres à une surface. Elles ne prouvent pas les mutations omises sur mobile. Aucun test des nouveaux lots Temps/Chantiers n'est retiré pour obtenir une CI verte. La [carte des preuves](carte-des-preuves.md) relie les risques aux suites.

## À terminer avant une affirmation plus large

- Relier toute nouvelle modification fonctionnelle à sa propre CI et sa propre recette ; les preuves ci-dessus qualifient 19502a6, pas une évolution future.
- Examiner les sélecteurs et chaînes métier restants du [plan](plan-completude-fonctionnelle-20261002.md), sans confondre liste récente volontairement bornée et portefeuille complet.
- Le nouveau lot [Prospects entrants](evidence/20261013-lead-inbox/README.md) doit réussir sa propre CI et sa propre recette hébergée. Les 36 cas SQL locaux et fixtures ne prouvent pas l'exécution des deux parcours compilés. Les résultats de `8d7b234` ne qualifient pas cette nouvelle évolution.
- Qualifier stockage persistant, comptes fournisseurs, délivrabilité, charge et reprise après arrêt brutal avant usage commercial. Le budget actuel reste de 0 €.

L'[historique de qualification](historique-qualification-candidat-20261010.md) conserve les références antérieures et leurs échecs. Les [preuves du socle](execution-cto-20261001.md) et la [recette hébergée sans stockage](qualification-demo-sans-stockage-20261010.md) restent datées. Aucun compteur de tests, rendu de démo ou ancien déploiement ne certifie tout le logiciel.
