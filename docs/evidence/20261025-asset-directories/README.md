# Lectures des sites et équipements

La [CI de `cee85ae`](https://github.com/lacombechristophe/freelio/actions/runs/40152216842) valide desktop, mobile et Linux, mais le parcours complet des équipements dépasse cinq secondes sur PostgreSQL. Les plans SQL montrent des lectures répétées faute d’index société/site. L’index seul améliore les équipements ; une recette élargie reproduit encore un dépassement sur les sites, dont les compteurs imbriqués sont agrégés avant pagination.

Le lecteur charge désormais la page, puis regroupe les équipements et tickets de ses 25 sites maximum, dans la même transaction et avec les mêmes restrictions. Le nouvel index sert les lectures d’équipements par société et site. Le format des réponses et les délais restent inchangés.

Le [reçu local](local.json) conserve le diagnostic, l’échec intermédiaire et 119 réussites sur chacun des deux moteurs. Les parcours vérifient toutes les pages de 201 sites et 301 équipements ; la dernière page, les compteurs filtrés, les rôles et les refus restent couverts. Le diff Prisma ajoute uniquement l’index. Ces mesures locales ne garantissent pas les temps de réponse hébergés ; aucune migration distante n’a été appliquée.

Pour reproduire les contrôles fonctionnels après génération du client et préparation d’une base de recette : `npm run test:unit -- tests/unit/operations-assets.integration.test.ts tests/unit/operations-dashboard-relations.integration.test.ts tests/unit/operations-details-relations.integration.test.ts`. Sur PostgreSQL, appliquer les migrations versionnées à cette base jetable avant le test. La CI exécute aussi toute la suite.

La [répétition incrémentale](incremental-upgrade.json) applique les migrations 73 → 75 avec Prisma après un essai des index entièrement annulé. Les cinq tables métier peuplées gardent leur empreinte et les 73 anciennes lignes du journal sont inchangées. Cette répétition ne migre pas Neon et ne remplace pas la recette de la démo hébergée. Les [contrôles de la PR](https://github.com/lacombechristophe/freelio/pull/8/checks) donnent le résultat distant du candidat publié.
