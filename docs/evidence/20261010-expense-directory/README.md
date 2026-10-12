# Historique Dépenses

Le [diagnostic](before.json) constate 50 lignes chargées sur 51, 50 € au lieu de 149 € et 50 dépenses à justifier au lieu de 51. Ses deux cas passent en reproduisant ces faits ; ce ne sont pas deux tests du correctif.

Le [contrat approuvé](../../contrat-depenses-listes-completes.md) précise recherche, pagination, cartes, dates et conservation des formulaires. La [qualification locale](local.json) conserve les commandes, résultats, empreintes des logs et limites. Les 26 nouveaux cas SQL utilisent de vraies adhésions, actions, DAL et données fictives. Les quatre E2E se chargent localement ; leur exécution est distincte.

Le [dernier candidat antérieur entièrement qualifié](ci-c054bff.json) conserve ses deux CI, les empreintes des rapports et les identités des images Linux. Il ne qualifie pas rétroactivement ce nouveau lecteur. Les checks GitHub et le compte rendu de la [PR #8](https://github.com/lacombechristophe/freelio/pull/8) identifient le SHA d'implémentation, sa fusion testée et les résultats PostgreSQL/Chromium ; la recette hébergée possède son déploiement propre.

Aucun conteneur ni serveur Next local n'est lancé pour ce lot. Aucun compte, secret ou stockage fournisseur n'est créé ; les tests SQL et seeds restent sur des bases fictives isolées. Cette recette ne mesure pas la charge hébergée et ne vérifie pas le stockage réel des justificatifs.
