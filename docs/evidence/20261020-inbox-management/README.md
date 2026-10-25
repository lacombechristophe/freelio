# Boîte de réception : tri, archives et prise en charge

Le lecteur de `977e60f` ignore les filtres boîte/attribution et refuse l'état Clos. Trois diagnostics SQL reproduisent ces écarts. `05c7e1b` ajoute ces filtres combinables, l'archivage/restauration et la prise en charge personnelle avec contrôle de concurrence. Un administrateur peut libérer une attribution devenue indisponible, sans transférer silencieusement le fil. Le [contrat de gestion](../../contrat-tri-conversations.md) distingue ces actions locales des observations fournisseur.

Sept autres diagnostics sur `05c7e1b` reproduisent des relations étrangères consultables, y compris pour Owner/Admin. `2103dec` applique la société aux références des fils, messages et événements dans les lectures directes, projections et compteurs ; les mêmes restrictions protègent archivage et attribution. Aucune donnée historique n'est supprimée ni réaffectée. Le [contrat des relations](../../contrat-relations-conversations.md) précise les quatre références contrôlées. Les [résultats avant correction](baseline.json) distinguent les deux reproductions.

La première suite complète sur `2103dec` passe 2 916 tests sur 2 917. Le seul échec concerne une réponse programmée : Prisma refuse un filtre dans la projection obligatoire EmailMessage.thread. `f4fcbc1` conserve le prédicat d'accès du message parent sans répéter ce filtre dans la projection ; listes et relations optionnelles restent filtrées. La recette vérifie les projections autorisées et refusées pour Owner, Admin et Sales. Aucune assertion, permission ou limite de délai n'est relâchée ; le résultat complet et le digest du log de cet échec sont conservés.

Les [résultats locaux](local.json) portent sur `f4fcbc1693bdb5ff7a166814c1610bad0b0f33f3` : **2 917 tests dans 253 fichiers**, sans échec ni exclusion, sur une nouvelle SQLite fictive. Les 53 contrôles ciblés passent avec leurs nettoyages. Types, ESLint, Oxlint et build de 76 pages statiques passent sur ce même code ; 1157 fichiers source correspondent à la recette. Les limites et digests des rapports/logs sont conservés, ainsi que les erreurs de préparation et nettoyage des premières fixtures ; elles ne sont pas présentées comme des défauts produit.

Pour reproduire dans une copie isolée avec base fictive préparée :

```sh
node node_modules/vitest/vitest.mjs run --no-file-parallelism tests/unit/inbox-management.integration.test.ts tests/unit/inbox-relations.integration.test.ts tests/unit/inbox-reader.integration.test.ts tests/unit/mailbox-access.integration.test.ts tests/unit/communication-dashboard.integration.test.ts tests/unit/member-mailbox-offboarding.integration.test.ts tests/unit/scheduled-emails.integration.test.ts
```

Le premier diagnostic dispose de sa [source portable](filter-reproduction.test.ts.txt), à copier dans tests/unit d'une copie contenant le lecteur d'origine. La régression des relations se rejoue avec inbox-relations.integration.test.ts sur les deux lecteurs de `05c7e1b`, puis sur `f4fcbc1`. Authentification et cache sont simulés comme indiqué par les tests ; Prisma, transactions et contraintes sont réels.

Les **456 cas navigateur (228 par surface) sont sélectionnés, pas exécutés**. La nouvelle recette inbox-management.spec.ts dispose de deux sociétés/comptes fictifs distincts, sans identifiants fournisseur. PostgreSQL, Linux/runtime et les parcours navigateur du commit exact restent à qualifier. Aucun push, nouvelle CI, merge, déploiement ni appel fournisseur n'est effectué ; le plafond GitHub Actions à 0 € reste non vérifié. Quotas d'envoi et exploitation réelle restent distincts de ce lot.
