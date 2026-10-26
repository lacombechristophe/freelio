# Dépendances et licences

`package-lock.json` fixe les versions installées. La CI audite séparément les dépendances de production et l’ensemble du lockfile. Ces contrôles observent les avis connus au moment de leur exécution ; ils ne certifient pas le code applicatif ou les composants système.

## Inventaire reproductible

```sh
node scripts/inventory-dependencies.mjs
```

Le rapport JSON contient l’empreinte SHA-256 du lockfile, les paquets, leurs métadonnées de licence et les éléments à examiner manuellement. Les déclarations npm ne couvrent pas à elles seules Debian, Chromium, les images de services, les polices ou les assets.

Le code propre reste sans licence de redistribution selon le choix du propriétaire. Les licences des bibliothèques et assets restent distinctes ; leur présence ne donne pas au projet une licence unique. Conserver leurs notices lors d’une distribution.

## Maintenance

Dependabot prépare des propositions hebdomadaires. Les paquets Vitest et `@vitest/*` évoluent ensemble pour conserver leurs contraintes de versions. Chaque mise à jour garde une revue et les mêmes contrôles de qualité ; aucune option `--force`, exclusion d’audit ou baisse de seuil n’est une procédure de qualification.

La politique [ESLint/Oxlint](../tooling/lint/README.md) conserve des règles résolues et des cas de contrôle. La règle Next locale dérivée d’une source officielle garde sa [licence MIT](../tooling/lint/NEXT-LICENSE.md). Une évolution de Next ou du moteur de lint doit vérifier ces cas et les écarts de comportement.

Auth.js est encore en série 5 beta. Les versions et adaptateurs Prisma sont coordonnés dans le lockfile. Les changements majeurs demandent une recette de compatibilité, même lorsqu’un audit de sécurité est vert.

Les [anciens inventaires et incidents de maintenance](history.md#dépendances-et-incidents) conservent leurs versions, erreurs et décisions. Ils ne qualifient pas le lockfile d’une livraison ultérieure.
