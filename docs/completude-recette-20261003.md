# Qualification du candidat Freelio

État du 14 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Main, preview de branche et production sont des références distinctes.

## Candidat en qualification

Les [choix de la commande fournisseur](evidence/20261014-purchase-choices/README.md), approuvés le 14 octobre, ajoutent recherche, pages de 25 et sélection vérifiée au Produit de chaque ligne et au Chantier. Les identités stables préservent recherches, quantités, prix et libellés après retrait d'une autre ligne. Les 35 nouveaux cas SQL passent, ainsi que les deux fixtures exécutées puis supprimées. Les payloads Produit bornés et inventaires détaillés inutilisés sont retirés du tableau de bord.

Le [contrôle de création Achat](evidence/20261014-purchase-creation-integrity/README.md), approuvé séparément, relit chantier/client/agence et produits actifs dans la transaction après préparation du numéro. Les 24 nouveaux cas SQL passent ; 171 contrôles ciblés au total, types, ESLint, Oxlint et les deux fixtures supplémentaires sont réussis. Les prix manuels sont conservés. Deux résultats métier explicites permettent d'afficher les refus approuvés en production sans exposer d'erreurs techniques.

Les 59 nouveaux cas Achat passent sur SQLite et PostgreSQL dans les deux CI de 6e01927. Quatre parcours compilés sont définis sur ordinateur/mobile, mais restent non exécutés après l'échec du build. La lecture hébergée exacte de ce commit passe 49 visites par surface ; elle ne remplace pas ces mutations. Les historiques d'achat, autres cartes et sélecteurs opérationnels restent séparés.

Les [contrôles de 6e01927](evidence/20261014-build-memory/README.md) restent rouges : le compilateur CLI de Next n'hérite pas du budget mémoire du parent, un test PostgreSQL enchaîne trop de lectures pour son délai, et le quota bloque la conservation des artefacts. La transmission du budget au compilateur et les [contrôles indépendants des recherches fournisseur](evidence/20261014-supplier-history-recipe/README.md) passent localement, avec typage et build. Leur qualification CI reste requise. Les 269 anciennes archives UI sont sauvegardées et vérifiées ; aucune suppression distante n'est encore autorisée.

Les [CI de faeb7b3](evidence/20261014-communication-dashboard/README.md) passent désormais types, lint, couverture et build, les 2 350 cas SQLite et 2 349 PostgreSQL avec une exclusion native SQLite. Deux défauts restent conservés : préchargement absent du builder Docker, puis blocage P1008 au GET Communications. Quinze cas navigateur passent et neuf échouent avant l'interruption à 45 minutes ; aucun résultat complet n'est revendiqué. La copie Docker est corrigée, et les deux lecteurs transactionnels du tableau de bord sont rendus successifs uniquement sur SQLite, avec douze contrôles ciblés réussis. Les critères, DTO et délais restent conservés. La preview exacte passe les 49 visites par surface, ce qui ne qualifie pas les mutations.

Les [CI de 49082a4](evidence/20261014-sqlite-transaction-queue/README.md) passent 2 354 SQLite, 2 353 PostgreSQL avec une exclusion native SQLite, types/lint/build et les neuf contrôles Linux. Communications est débloqué ; les quatre parcours Achat passent dans la PR. Cette recette termine à 408 réussites, trois échecs et 19 exclusions historiques ; la branche reste interrompue à 45 minutes. Le ciblage du test Fournisseurs et les transactions interactives SQLite concurrentes entre actions Campagnes sont corrigés. La file est bornée au maxWait existant, conserve chaque contexte et laisse PostgreSQL inchangé. La qualification du nouveau candidat et la publication des artefacts restent requises. Le passage local complet et le raffinement d'horloge sont distingués dans leurs preuves.

## Dernier code entièrement qualifié

`2b05e5f6d425542971285f13170fbcb44bb6f1bb` complète le tableau et les indicateurs Stock. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38474885583) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38474891166) passent entièrement à leur première tentative.

| Contrôle | Résultat du candidat 2b05e5f |
| --- | --- |
| Types, ESLint, Oxlint et build | Réussis dans les deux CI |
| SQLite avec couverture | 2 287 tests / 216 fichiers réussis dans chaque CI |
| PostgreSQL | 2 286 réussis et une exclusion native SQLite ; les 29 nouveaux cas Stock passent sans exclusion |
| Navigateur compilé | 407 réussis et 19 exclusions historiques dans chaque CI ; les deux nouveaux parcours Stock passent |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de 2b05e5f | 49 pages/onglets par surface, zéro erreur JavaScript, retry ou exclusion |

Les [preuves CI](evidence/20261013-candidate/ci-2b05e5f.json), l'[identité du code](evidence/20261013-candidate/source-2b05e5f.json) et la [recette hébergée](evidence/20261013-candidate/hosted-2b05e5f.json) sont conservées. Les 1 056 entrées Git hors `docs/` correspondent au merge PR testé `4661666399328870f1f4ebf2cf4ad05f36d04b71`. Harnais et alias correspondent au déploiement `dpl_HngJyPKo1Ab7dDNqNVjxdMseBXwH`. La suite navigateur dure 21,9 minutes sur la branche et 23,3 minutes sur la PR. Les mutations sont qualifiées par la recette compilée ; la lecture hébergée ne les prouve pas.

## Référence précédente : Choix Produit Opérations

`bfe5d6bbc82032f24e95a51342ab17990af75333` complète les six choix Produit d'Opérations et corrige le périmètre des locators Client de la commande. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38469876666) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38469883072) passent entièrement à leur première tentative.

| Contrôle | Résultat du candidat bfe5d6b |
| --- | --- |
| Types, ESLint, Oxlint et build | Réussis dans les deux CI |
| SQLite avec couverture | 2 258 tests / 215 fichiers réussis dans chaque CI |
| PostgreSQL | 2 257 réussis et une exclusion native SQLite ; les 46 nouveaux cas Produit passent sans exclusion |
| Navigateur compilé | 405 réussis et 19 exclusions historiques dans chaque CI ; les douze parcours Produit et huit parcours Client passent |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de bfe5d6b | 49 pages/onglets par surface, zéro erreur JavaScript, retry ou exclusion |

Les [preuves CI](evidence/20261013-candidate/ci-bfe5d6b.json), l'[identité du code](evidence/20261013-candidate/source-bfe5d6b.json) et la [recette hébergée](evidence/20261013-candidate/hosted-bfe5d6b.json) sont conservées. Les 1 050 entrées Git hors `docs/` correspondent au merge PR testé `7a1f7e16d9a47665fa65bd553b6a8c072fc277fb`. Harnais et alias correspondent au déploiement `dpl_5CyuBX49L6jjUabVn1XSQHARt5BA`. Les logs complets du job PR, récupérés directement par l'API GitHub, complètent les sections SQLite et audit de production absentes de la sortie agrégée gh ; leur digest est conservé. Les mutations sont qualifiées par la recette compilée ; la visite hébergée ne les prouve pas. La suite navigateur dure 28 minutes sur la branche et 22,6 minutes sur la PR. Les [échecs précédents de ca6f6fb](evidence/20261013-operations-product-choices/ci-regressions.md) restent conservés.

## Référence précédente : Choix Client Opérations

`d36a38df8943f4911e09e62d76fe759db85c759e` complète les quatre choix Client d'Opérations, avec vérification de la sélection et conservation de la saisie. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38458527241) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38458533156) passent entièrement à leur première tentative.

| Contrôle | Résultat du candidat d36a38d |
| --- | --- |
| Types, ESLint, Oxlint et build | Réussis dans les deux CI |
| SQLite avec couverture | 2 212 tests / 214 fichiers réussis dans chaque CI |
| PostgreSQL | 2 211 réussis et une exclusion native SQLite ; les 28 nouveaux cas Client passent sans exclusion |
| Navigateur compilé | 393 réussis et 19 exclusions historiques dans chaque CI ; les huit nouveaux parcours Client passent |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de d36a38d | 49 pages/onglets par surface, zéro erreur JavaScript, retry ou exclusion |

Les [preuves CI](evidence/20261013-candidate/ci-d36a38d.json), l'[identité du code](evidence/20261013-candidate/source-d36a38d.json) et la [recette hébergée](evidence/20261013-candidate/hosted-d36a38d.json) sont conservées. Les 1 045 entrées Git hors `docs/` correspondent au merge PR testé `c18a42fc12734db8b09c70c7758e464f5ddd0cf2`. Harnais et alias correspondent au déploiement `dpl_3FaE77dujpx91xCingPgmEPWF9CY`. Les mutations sont qualifiées séparément sur la recette compilée, pas par la consultation hébergée. Le budget global du job est porté de 35 à 45 minutes ; les délais individuels des tests et seuils d'audit restent conservés. La suite navigateur dure 23,6 minutes sur la branche et 27,6 minutes sur la PR ; ce résultat ne prouve aucun test de charge.

## Référence précédente : Prospects entrants


`ffee948bb39d2efcd48d879fb67bd027f057e42e` complète la boîte des prospects entrants : recherche et statut sur toute la société, pages de 25, cartes complètes et suppression du payload commercial inutilisé. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38453450025) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38453459048) passent entièrement à leur première tentative.

| Contrôle | Résultat du candidat ffee948 |
| --- | --- |
| Types, ESLint, Oxlint et build | Réussis dans les deux CI |
| SQLite avec couverture | 2 184 tests / 213 fichiers réussis dans chaque CI |
| PostgreSQL | 2 183 réussis et une exclusion native SQLite ; les 36 nouveaux cas Prospects passent sans exclusion |
| Navigateur compilé | 385 réussis et 19 exclusions historiques dans chaque CI ; les deux nouveaux parcours Prospects et les 14 parcours précédents passent |
| Image Linux | Neuf contrôles réussis dans les deux CI |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview de ffee948 | 49 pages/onglets par surface, zéro erreur JavaScript, retry ou exclusion |

Les [preuves CI](evidence/20261013-candidate/ci-ffee948.json), l'[identité du code](evidence/20261013-candidate/source-ffee948.json) et la [recette hébergée](evidence/20261013-candidate/hosted-ffee948.json) sont conservées. Les 1 042 entrées Git hors `docs/` correspondent au merge PR testé `f17a829121f701d8a9e8cb3229e458df9c98122c`. Harnais et alias correspondent au déploiement `dpl_CU8YWeS8dZA5uyKE7ZjHgazVAyCr`. Les mutations sont qualifiées séparément sur la recette compilée, pas par la consultation hébergée. La suite navigateur dure 26,7 minutes sur la branche et 26 minutes sur la PR ; ce résultat ne prouve aucun test de charge.

## Référence précédente : Portail, Modèles et Affaires


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
- Le nouveau lot [choix Produit Opérations](evidence/20261013-operations-product-choices/README.md) doit réussir sa propre CI et sa propre recette hébergée. Ses 46 cas SQL locaux et ses fixtures ne prouvent pas les douze parcours compilés ; les résultats de `d36a38d` ne qualifient pas cette nouvelle évolution.
- Qualifier stockage persistant, comptes fournisseurs, délivrabilité, charge et reprise après arrêt brutal avant usage commercial. Le budget actuel reste de 0 €.

L'[historique de qualification](historique-qualification-candidat-20261010.md) conserve les références antérieures et leurs échecs. Les [preuves du socle](execution-cto-20261001.md) et la [recette hébergée sans stockage](qualification-demo-sans-stockage-20261010.md) restent datées. Aucun compteur de tests, rendu de démo ou ancien déploiement ne certifie tout le logiciel.

## Qualification Produit : échec conservé

ca6f6fb ne réussit pas la qualification complète : les deux CI donnent 403 parcours réussis, 19 exclusions et deux erreurs de locator du choix Client sur la commande. Les douze nouveaux parcours Produit, 2 258 SQLite, 2 257 PostgreSQL avec une exclusion native SQLite, neuf contrôles Linux et deux audits sans vulnérabilité passent. Sa preview parcourt 49 pages/onglets par surface sans erreur JavaScript, retry ou exclusion. Les [preuves rouges](evidence/20261013-candidate/ci-ca6f6fb.json) et le [diagnostic de locator](evidence/20261013-operations-product-choices/ci-regressions.md) sont conservés. La correction du test doit encore réussir sa propre qualification complète.

## Qualification interrompue de 87c70a1

Les deux CI Achat de 87c70a1 échouent au typage par épuisement du plafond V8 de 2 Go, reproduit localement. Le passage mesuré avec 4 Go utilise environ 2,5 Go ; seul le budget du compilateur est explicité. PostgreSQL passe 2 345 cas sur la branche, avec une exclusion native SQLite ; le job PR échoue au téléchargement ECR avant les tests. Linux et les audits passent. Les parcours navigateur ne sont pas exécutés. Vercel bloque la preview pour auteur Git non associé. Les [échecs, mesures et corrections](evidence/20261014-ci-typecheck/README.md) sont conservés. Stock 2b05e5f reste la dernière référence entièrement qualifiée jusqu'au passage des gates du nouveau candidat.

## Qualification interrompue de 2f21a5d

Les deux CI passent types et lint, puis échouent sur deux délais de pagination préexistants : 2 344 cas SQLite réussis, deux délais dépassés. PostgreSQL passe 2 345 cas et une exclusion native SQLite ; Linux et audits passent. Les parcours navigateur ne sont pas exécutés. La preview exacte parcourt 49 pages/onglets par surface sans erreur JavaScript, retry ou exclusion. Les [traces et correction de recette](evidence/20261014-pagination-recipe/README.md) conservent les échecs : trois lectures de page simultanées deviennent successives dans ces deux tests, avec assertions et délais inchangés. Le passage local complet conserve 2 305 cas réussis et un hook de lint en dépassement ; il n’est pas revendiqué entièrement vert. Stock 2b05e5f reste la dernière référence complètement qualifiée.

## Build et stockage CI de 6ca0981

Les deux CI de 6ca0981 passent 2 346 cas SQLite et tous les contrôles de types/lint. La compilation webpack réussit, mais le contrôle TypeScript du build atteint son plafond d’environ 2 Go. Le budget explicite de 4 Go permet ensuite le build local complet, TypeScript compris. Les [preuves et limites](evidence/20261014-build-memory/README.md) distinguent aussi le quota d’artefacts atteint : neuf contrôles Linux réussis dans chaque run et 2 345 PostgreSQL sur la branche, mais rapports détaillés non téléversés. La PR PostgreSQL est arrêtée avant les tests par le refus du registre ECR. Les parcours navigateur ne sont pas exécutés après l’échec du build. La preview exacte passe 49 pages/onglets par surface en lecture seule. L’archive locale des anciens rapports UI est préparée avant toute demande de suppression ; aucune suppression distante ni dépense n’est engagée.
