# Contexte d’autorisation et requêtes Prisma différées

La [comparaison](comparison.json) emploie le même fichier `tests/unit/auth-context.integration.test.ts` : sept échecs avec `auth-wrapper.ts` de `653cddc`, puis sept réussites avec le correctif. Seul ce fichier source est substitué dans la recette pour ce contrôle ; les autres fichiers restent ceux du candidat de travail. Il est restauré après le test.

Les callbacks retournent directement des promesses Prisma différées. Les cas vérifient les refus d’écritures générales, financières, imbriquées, groupées et depuis une lecture Service ; une lecture sans filtre doit rester dans sa société ; une écriture Owner vers une autre société doit être refusée avec P2025. Les fixtures des deux sociétés sont nettoyées après exécution.

```sh
npm run test:unit -- tests/unit/auth-context.integration.test.ts
```

Employer une copie isolée, une base neuve et les dépendances du lockfile. Session simulée, membership et SQL réels. Les empreintes ne sont pas une preuve universelle de l’isolation : agences, autres modèles, imports directs hors `withAuth` et infrastructure finale restent des périmètres distincts. PostgreSQL doit encore être qualifié sur ce nouveau correctif.
