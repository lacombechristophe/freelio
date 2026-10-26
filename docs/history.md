# Archives de qualification

Les journaux d’exécution, anciens plans et reçus sont conservés dans Git à leur révision d’origine. Ils ont été retirés de la documentation courante le 26 octobre 2026 pour séparer les procédures utilisables des constats historiques. L’historique publié n’est pas réécrit.

Le point de conservation est [`f992e9b`](https://github.com/lacombechristophe/freelio/commit/f992e9b3c667293d9c3cead1bed3f312d907d2b6). Ses [documents](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs), [preuves](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/evidence), [tâches](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/tasks), [livraisons](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/deliveries) et [cadrage initial](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/prompt.md) restent accessibles par ces liens immuables. Une copie locale supplémentaire avec empreintes SHA-256 accompagne le rangement.

## Index des recettes

| Référence | Contenu |
| --- | --- |
| [Préparation CTO](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/plan-vitrine-cto-20260930.md) | Cadrage initial et critères de revue |
| [Audit de complétude](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/plan-completude-fonctionnelle-20261002.md) | Écarts identifiés avant les corrections |
| [Journal des lots](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/journal-recettes-completude-20261003.md) | Décisions, contrats, régressions, CI et limites de chaque lot |
| [Carte des preuves](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/carte-des-preuves.md) | Correspondance risques/tests de cette référence |
| [Contrats métier](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs) | Contrats détaillés par domaine, avec leurs résultats datés |
| [Livraison initiale du 25 octobre](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/livraison-demo-20261025.md) | Première fusion de complétude ; ne décrit pas les livraisons suivantes |
| [Prisma 7](https://github.com/lacombechristophe/freelio/tree/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/evidence/20261025-prisma7) | Installation isolée, compatibilité, audit et récupération native fictive |

La CI de main [`f992e9b`](https://github.com/lacombechristophe/freelio/actions/runs/40367503504) est la référence précédant ce rangement. Les PR [#15](https://github.com/lacombechristophe/freelio/pull/15), [#16](https://github.com/lacombechristophe/freelio/pull/16) et [#17](https://github.com/lacombechristophe/freelio/pull/17) retracent les corrections d’interface et leurs régressions. Leurs résultats ne qualifient pas une version ultérieure.

## Dépendances et incidents

Les [inventaires successifs](https://github.com/lacombechristophe/freelio/blob/f992e9b3c667293d9c3cead1bed3f312d907d2b6/docs/dependances-et-licences.md) conservent les avis connus, lockfiles et propositions non retenues. Les reçus gardent les échecs et relances, notamment la première tentative de livraison et le défaut de navigation vers une ancre corrigé par la PR #17. Retirer un rapport de l’arborescence courante ne transforme pas son résultat en réussite.

Les captures de travail, bases fictives, sauvegardes et secrets restent hors du dépôt. Les anciens liens de preview peuvent expirer ; ils ne sont pas présentés comme des environnements courants. Pour une nouvelle livraison, consulter la [procédure de qualification](testing.md) et le commit effectivement servi.
