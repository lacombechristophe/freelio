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

Les actions GitHub sont référencées par leur SHA complet, vérifié dans le dépôt officiel, avec la version lisible en commentaire. Dependabot suit aussi ces références. Lors d’une mise à jour, examiner le changement amont et conserver les permissions minimales ; un tag majeur seul ne fixe pas le code exécuté par la CI.

La politique [ESLint/Oxlint](../tooling/lint/README.md) conserve des règles résolues et des cas de contrôle. La règle Next locale dérivée d’une source officielle garde sa [licence MIT](../tooling/lint/NEXT-LICENSE.md). Une évolution de Next ou du moteur de lint doit vérifier ces cas et les écarts de comportement.

Auth.js est encore en série 5 beta. Les versions et adaptateurs Prisma sont coordonnés dans le lockfile. Les changements majeurs demandent une recette de compatibilité, même lorsqu’un audit de sécurité est vert.

## Avis suivis au 5 novembre 2026

L’avis modéré [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249) affecte `minimatch` de la version 7 à 11.0.0. Le correctif 11.0.1 est imposé uniquement sous `@typescript-eslint/typescript-estree`, qui utilisait 10.2.5. Les autres consommateurs de `minimatch` restent sur leur version. Cet override de l’outillage doit être réexaminé quand la chaîne TypeScript-ESLint fournit une version corrigée ; les contrôles ESLint/Oxlint et leurs cas de politique restent obligatoires.

L’avis faible [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) reste ouvert sur `deepmerge@4.3.1`, apporté par `@react-email/render@2.0.6 → html-to-text@9.0.5`, sans version corrigée publiée à cette date. Dans les appels examinés de `email-content.ts` et `email-preflight.ts`, le HTML peut provenir d’un utilisateur, mais les options fusionnées sont définies par le code de l’application. Aucun chemin permettant à l’utilisateur de fournir ces objets d’options n’a été identifié. Cette revue statique ne démontre pas une absence universelle d’exploitabilité. Le seuil d’audit reste inchangé ; les avis faibles sont signalés, sans présenter l’audit comme exempt de vulnérabilité.

Les [anciens inventaires et incidents de maintenance](history.md#dépendances-et-incidents) conservent leurs versions, erreurs et décisions. Ils ne qualifient pas le lockfile d’une livraison ultérieure.
