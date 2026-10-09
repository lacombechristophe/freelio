# Projections Client des détails Service

Les lecteurs de ticket, d'équipement et d'intervention retournaient le Client complet, y compris ses quatre caches financiers et de santé globale. Le correctif `f88fa41` applique `clientWithAccessibleMetrics`, déjà utilisé par les autres lecteurs CRM, aux trois réponses serveur.

La [reproduction sur e25c8d1](baseline.json) compte 21 échecs et six témoins positifs : un technicien obtenait les quatre caches ; Viewer obtenait les indicateurs globaux malgré son périmètre d'agence ; une rétrogradation dans la même session ne les masquait pas. Les contrôles Owner/Admin conservaient les valeurs attendues.

Le correctif ne change aucun composant visuel. Ces quatre champs ne sont pas rendus par les pages de détail concernées. Les coordonnées, contacts, coûts opérationnels et historiques gardent leur définition ; la matrice des rôles n'est pas modifiée. Owner/Admin conservent les valeurs globales, Viewer conserve son accès au renouvellement selon la règle commune existante.

La [qualification locale](local.json) compte 27 cas réussis pour ces projections, avec les 24 cas de réservation conservés. La suite complète passe 1 523 tests dans 181 fichiers ; typage, ESLint, Oxlint et compilation réussissent. La qualification PostgreSQL, navigateur et Linux de ce code reste requise.

Dans une copie isolée avec une base fictive et Prisma généré :

```sh
npm run test:unit -- tests/unit/service-detail-client-metrics.integration.test.ts
```

Pour reproduire l'avant correction, récupérer ce fichier de test depuis `f88fa41` et l'exécuter sur `e25c8d1`. Session et cache Next sont simulés ; les lectures SQL, le DAL et les réponses des actions sont réels. Les fixtures sont cohérentes et aucun fournisseur n'est appelé. Le périmètre est la projection de ces quatre caches Client, pas l'ensemble des relations imbriquées ni toutes les données financières d'Opérations.
