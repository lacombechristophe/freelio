# Inventaire des dépendances et licences

Le lockfile est la référence des versions réellement installées. `node scripts/inventory-dependencies.mjs` produit un inventaire JSON reproductible, avec SHA-256 du lockfile, métadonnées de licence, dépendances de développement et éléments à examiner manuellement. Les métadonnées npm ne constituent pas une validation des droits de redistribution.

Au contrôle du 1er octobre 2026, 1 039 entrées possèdent une licence déclarée ; aucune n’est sans métadonnée. Certaines déclarent LGPL, MPL ou CC-BY : conserver et examiner les textes/attributions applicables avant distribution. Ne pas présenter l’ensemble comme exclusivement MIT. Les composants système de Debian/Chromium, les images de services, les polices et les assets ne sont pas couverts par le lockfile.

L’audit npm du même lockfile, répété le 2 octobre 2026, ne signale aucune vulnérabilité connue. Les [métadonnées conservées](evidence/20261002/dependencies.json) identifient le lockfile et les licences à examiner. Ce résultat ne couvre ni le code applicatif ni les paquets Debian ; la CI répète l’audit et Dependabot prépare les mises à jour à revoir.

Le code propre reste privé, sans licence de publication choisie. L’inventaire n’autorise pas implicitement une publication open source. Les notices de bibliothèques et la provenance des assets doivent accompagner un partage public. La qualification d’un service Redis managé inclut les conditions de son fournisseur et de la version utilisée ; le conteneur Redis de recette n’est pas une décision d’hébergement.

Prisma 6.12 et Auth.js 5 beta sont des décisions provisoires décrites dans le registre technique. Le passage à Prisma 7 change génération, configuration et adaptateur du driver, comme le décrit le [guide officiel](https://www.prisma.io/docs/guides/v7/deployment/docker). La documentation Auth.js conserve un [guide de migration v5](https://authjs.dev/getting-started/migrating-to-v5). Ces références ne prouvent pas une durée de maintenance contractuelle des versions installées ; leur qualification reste un travail identifié avant l’exploitation de données réelles.
