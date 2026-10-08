# Stocks et historique fournisseur : lectures par agence

Le fournisseur et le produit appartiennent à la société. Leur lecture ne doit pas ouvrir les stocks, commandes ou retours d’une agence inaccessible au membre connecté.

La recette SQL a reproduit trois échecs sur la fiche fournisseur, puis trois autres dans Opérations et le catalogue : deux unités autorisées étaient présentées avec les 99 unités d’une autre agence. Le filtrage des modèles racines ne protégeait pas ces relations imbriquées.

Le correctif filtre explicitement les stocks par entrepôt et agence, les commandes par chantier et les retours par leurs rattachements. Il conserve la vue complète du propriétaire et de l’administrateur. Les droits et affectations sont relus avec la session existante, y compris après révocation.

Validation locale sur copie isolée et données fictives : neuf cas SQL dédiés, 884 tests dans 154 fichiers, TypeScript, ESLint et Oxlint passent. Le build de production compile et génère 74 pages. Aucun fournisseur réel n’est appelé. La CI de ce correctif reste à effectuer après publication.

Ces preuves couvrent les quatre lectures corrigées, pas toutes les relations imbriquées du logiciel. Les historiques plafonnés des fiches restent un chantier distinct.

Test : [supplier-read-scope.integration.test.ts](../tests/unit/supplier-read-scope.integration.test.ts).
