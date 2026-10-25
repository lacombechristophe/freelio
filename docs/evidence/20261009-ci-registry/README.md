# Téléchargement des images de CI

Les deux CI de `6c8cffb` échouent avant les tests PostgreSQL et Linux : Docker Hub refuse les téléchargements anonymes pour dépassement de quota. Le [rapport](registry.json) conserve les runs, jobs et empreintes des logs privés. Ces échecs restent attachés à ce candidat.

Le Dockerfile, le service PostgreSQL de CI et le contrôle de conteneur utilisent désormais les images officielles Node 24, PostgreSQL 18.6 et Redis 7.4 sur ECR Public, avec les mêmes variantes. La directive de frontend Docker Hub est retirée ; les instructions utilisées restent celles du frontend intégré. Docker décrit cette publication dans son [annonce officielle](https://www.docker.com/blog/news-from-aws-reinvent-docker-official-images-on-amazon-ecr-public/).

Les quatre manifests répondent HTTP 200 et proposent Linux amd64. Le rapport conserve leurs empreintes observées ; elles ne constituent pas un épinglage des tags. Cette lecture ne qualifie ni téléchargement complet, ni build, ni exécution. ECR Public possède aussi des quotas. Aucun abonnement, moteur local, conteneur local ou réduction des contrôles n'est utilisé pour ce changement ; la qualification de son candidat est détaillée ci-dessous.

Les [résultats partiels de 6c8cffb](ci-6c8cffb.json) conservent les réussites qualité et les échecs globaux. Les [deux CI de 369f413](../20261009-order-billing-stale-balance/ci-369f413.json) passent PostgreSQL et neuf contrôles Linux. Le job Linux de branche échoue d’abord sur le quota ECR anonyme, après construction de l’image ; sa relance ciblée réussit sans changement de code. ECR réduit ici la dépendance à Docker Hub, sans supprimer le risque de quota. Logs qualité de tentative 1 et artefact Linux final de tentative 2 sont distingués.
