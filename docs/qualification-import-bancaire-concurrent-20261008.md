# Import bancaire : fichiers simultanés

Deux imports pouvaient lire les mêmes empreintes absentes, puis tenter leur création. La contrainte unique protégeait les données, mais l’un des imports échouait au lieu de compter les doublons.

Le test lit les vrais résultats SQL et retient leur résolution jusqu’à ce que huit actions aient lu l’absence des 25 mêmes lignes. Seule cette ordonnance est instrumentée ; la session est simulée, et les droits, le DAL, les écritures et les contraintes SQL restent réels. Une échéance de deux secondes libère la barrière si sa préparation échoue ; l’assertion exige les huit lectures initiales vides. Le wrapper attendable du test n’est pas un `PrismaPromise` destiné aux transactions par tableau.

Sur SQLite fictive, le code précédent produisait sept refus P2002 et une création de 25 lignes. Sans barrière, cette exécution pouvait passer simplement parce que les lectures se sérialisaient : ce succès ne reproduisait pas la fenêtre du conflit.

Le correctif déduplique le fichier en mémoire, puis retente au maximum trois fois uniquement le conflit de contrainte d’empreinte. Chaque tentative relit les empreintes déjà commises. `createMany` reste atomique et son résultat SQL fournit le compteur créé ; les autres erreurs ne sont pas absorbées. Les textes, le mapping CSV et les commandes d’interface ne changent pas.

La recette ciblée du correctif réussit ses 44 cas Banque, dont les huit imports forcés : huit réponses réussies, 25 créations cumulées et 175 doublons, 25 lignes en base. Un cas supplémentaire vérifie les doublons internes au fichier et son rejeu. La suite complète réussit **909 tests / 156 fichiers en 134,53 secondes**, avec types, ESLint et Oxlint. Le build compile et génère **75 pages** ; la découverte conserve 172 E2E / 39 fichiers. La CI de cette nouvelle référence reste à qualifier. La CI Fournisseurs du candidat précédent demeure une exécution distincte.

Ce contrôle ne clôture pas les courses de rapprochement, les paiements ni une charge PostgreSQL. La limite de trois tentatives peut encore refuser un import soumis à des conflits répétés ; elle conserve l’erreur plutôt que d’annoncer un faux succès.

Test : [banking-concurrency.integration.test.ts](../tests/unit/banking-concurrency.integration.test.ts). Action : [bank/index.ts](../src/actions/bank/index.ts).

La [CI de branche 5616823](https://github.com/lacombechristophe/freelio/actions/runs/37777822124) et sa [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37777827194) exécutent les deux cas d’import concurrent sur PostgreSQL avec succès. Les parcours Banque passent également. Ces workflows restent en échec sur des parcours Catalogue et des sélecteurs Opérations, détaillés dans la [qualification Fournisseurs](qualification-fournisseurs-historiques-20261008.md) ; ces réussites ciblées ne constituent pas une CI globale verte.
