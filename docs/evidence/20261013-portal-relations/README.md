# Relations du portail client

Le diagnostic sur `77a7756` conserve un accès cohérent, mais quatre refus attendus échouent : un lien vers un client étranger, un contact d'un autre client, la confirmation d'une demande incohérente et la révocation d'un accès incohérent. Les fixtures insèrent ces références directement en SQL ; elles ne démontrent pas une création incohérente depuis les formulaires ordinaires.

- [Diagnostic et observations](before.json), [reproducteur](reproducer.test.ts.txt).
- [Nettoyage](cleanup.json) : la première fixture omettait de supprimer les clients avant leurs sociétés ; suppression explicite puis seconde exécution avec l'ordre corrigé. Les deux contrôles finaux SQL comptent zéro société et utilisateur de cette recette.
- [Contrat approuvé](../../contrat-portail-relations.md).
- [Recette locale après correction](local-after.json) : 31 cas SQL sur SQLite, auth/cookies/cache/limiteur simulés. Le lecteur relit les références sur chaque session ; les mutations vérifient aussi leurs relations dans le prédicat d'écriture.

Les deux cas compilés ordinateur/mobile sont définis dans `tests/e2e/portal-relations.spec.ts`, avec seed isolé et écritures SQL contrôlées. Leur exécution CI et celle de PostgreSQL restent à qualifier sur le commit publié. Aucun compte fournisseur, donnée réelle, calendrier ou notification sortante n'est utilisé.
