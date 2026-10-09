# Droits des actions de facturation

Le correctif `e13d3d7` impose les droits Finance avant les lectures métier et refuse les factures liées à un client d'une autre société. Le [contrat approuvé](../../contrat-actions-factures-droits.md) décrit le comportement, notamment le calcul des avoirs et la relecture avant envoi de relance.

## Reproduire le défaut

Dans une copie isolée de `d1cd591`, préparée avec le lockfile, Prisma SQLite, une base fictive et des clés de test, copier depuis `e13d3d7` ces deux fichiers de tests :

- `tests/unit/invoice-action-scope.integration.test.ts`
- `tests/unit/invoice-reminder-command.integration.test.ts`

Exécuter ensuite :

```sh
npm run test:unit -- tests/unit/invoice-action-scope.integration.test.ts tests/unit/invoice-reminder-command.integration.test.ts
```

La [baseline finale](baseline.json) conserve 29 échecs et 14 réussites sur 43 cas. Les empreintes identifient les deux sources initiales et les tests réutilisés. Aucun hook ne remplace une assertion métier. La reproduction locale a remis les fichiers métier initiaux dans la copie de test, puis restauré le candidat après exécution.

Les fixtures SQL créent volontairement des relations incohérentes. Elles ne prouvent pas qu'une mutation courante de l'application permet de créer chaque incohérence. Plusieurs échecs portent sur un contrôle trop tardif : le DAL refusait déjà les paiements interdits et le contrôle du destinataire refusait les deux relances incohérentes.

## Qualification locale

Les [résultats locaux](local.json) passent 34 cas des actions, neuf cas de commande de relance, quatre courses de paiement et 33 cas Documents, soit 80 contrôles ciblés dans la suite complète. Les 1 472 tests SQLite / 178 fichiers, types, ESLint, Oxlint et build passent. Une première exécution complète avait échoué sur l'assertion d'un mock qui ne prévoyait que le filtre société ; l'assertion exige désormais aussi le filtre de société du client.

Session et cache Next sont simulés ; droits, contexte, Prisma et transactions sont réels. L'archive est simulée dans la nouvelle suite : son appel est vérifié, pas son rendu. Le transport des relances est simulé, avec préparation de commande et historique SQL réels. Les contrôles positifs conservent les rôles autorisés, les lectures Viewer et les corrections d'avoirs cohérents. Les refus de factures incohérentes vérifient l'absence de paiements, relances, avoirs et appels au générateur.

Les [deux CI de de24513](ci-de24513.json) passent 1 471 tests PostgreSQL et une exclusion native SQLite ; 1 472 tests SQLite dans les deux suites ; 277 E2E et 19 exclusions historiques ; neuf contrôles Linux et les deux audits à zéro. Les 34 cas des actions, neuf des relances et quatre des paiements concurrents passent sur PostgreSQL. Les 942 entrées Git hors documentation correspondent exactement à la fusion de test PR. Types, lints, build et couverture réussissent.

Le navigateur conserve notamment les six parcours Documents et huit Récurrences ; aucun E2E spécifique aux appels directs des nouvelles actions n'est revendiqué. Remboursements, contention des avoirs, charge hébergée et comptes fournisseur réels restent distincts.
