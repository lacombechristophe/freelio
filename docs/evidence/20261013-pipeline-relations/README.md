# Relations des affaires

Le diagnostic sur `c5d1191` exécute les vraies actions sur une SQLite fictive : deux contrôles passent et quatre échouent. Les références incohérentes sont introduites directement dans SQL ; cela ne démontre pas leur création par les formulaires ordinaires.

Le correctif utilise un périmètre commun : pipeline et client de la société, responsable absent ou membership de la société. Il couvre le Pipeline, ses compteurs, le détail, les synthèses CRM/Ventes, le rapport exécutif et les actions ordinaires, y compris les propriétés CRM. Les compteurs utilisés pour empêcher la suppression d'un cycle contenant des données historiques restent exhaustifs.

`local-after.json` contient 103 contrôles SQL réussis : 25 nouvelles régressions et 78 contrôles existants du détail, des synthèses et des choix Client Documents. Les cas couvrent les huit rôles, les responsables historiques locaux, les trois relations étrangères, les refus sans audit et quatre changements de référence entre lecture et écriture. Session et invalidation de cache sont simulées ; les memberships, relations, transactions et audits sont réels.

Le refus attendu est renvoyé comme résultat structuré pour rester lisible après compilation Next.js. Les notifications existantes affichent « Opportunité introuvable » sans message de succès ni rafraîchissement de formulaire. Les autres erreurs restent des exceptions ; aucun détail SQL n'est rendu public par cette conversion.

Deux suites complètes locales avant cette conversion atteignent 2 146 réussites / deux délais dépassés, puis 2 147 / un délai dépassé, sur des tests préexistants. Leurs rapports restent conservés. Les rejeux isolés passent les neuf tests Campagnes et les dix-sept tests de reprise des e-mails, sans modification de délai ou d'assertion. Ces résultats ne constituent pas un passage de la suite complète avec couverture ; la CI du nouveau commit reste nécessaire.

La recette compilée `tests/e2e/pipeline-relations.spec.ts` vérifie les cartes et le compteur, les deux URL incohérentes, une édition cohérente et une édition refusée après changement de responsable, avec notification attendue et saisie conservée, sur ordinateur et mobile. `seed.json` atteste les six lignes fictives, les comptes et leur nettoyage. La définition de la recette n'est pas une preuve d'exécution : ses résultats seront qualifiés sur le commit publié.

Les sauvegardes, restaurations et imports administratifs ne sont pas transformés en réparations implicites. Aucune migration ni réaffectation des lignes historiques, aucune facture ou aucun courriel réel.

Reproduction dans une base de recette préparée, sans données réelles :

```sh
npx vitest run tests/unit/pipeline-relations.integration.test.ts tests/unit/opportunity-read-scope.integration.test.ts tests/unit/workspace-access.integration.test.ts
```

Le contrat visible a été approuvé le 13 octobre 2026. Le contrôle complet du candidat et les limites de la démonstration restent documentés séparément.
