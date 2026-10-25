# Choix complets de la commande fournisseur

Le [diagnostic sur 2b05e5f](before.json) confirme 501 produits actifs et 301 chantiers actifs, puis échoue sur la présence des dernières références dans getOperationsDashboard. Le [reproducteur](reproducer.test.ts.txt) utilise le lecteur publié et ses dépendances vérifiées, avec session Auth.js et cache Next simulés ; Prisma et les permissions restent réels. Le [lot visible](../../contrat-achats-choix-complets.md) est approuvé.

Les deux nouveaux lecteurs retournent une page de 25 et une sélection résolue séparément dans un snapshot Serializable. Le Produit transmet seulement id, référence, libellé et coût courant. Le Chantier transmet seulement id et nom : actif, société et client cohérents, agence autorisée. Le coût préremplit une ligne uniquement lorsque l'utilisateur choisit explicitement un produit ; une actualisation de recherche ne remplace pas le prix ou le libellé saisi.

Chaque ligne a une identité stable et une recherche indépendante. Retirer une autre ligne conserve son choix, sa recherche, son prix et sa quantité. Les réponses périmées sont ignorées ; une sélection non vérifiée bloque la création et un choix disparu peut être remplacé. Le fournisseur, les lignes libres, le chantier, la date et les instructions restent conservés. Fermer et rouvrir le formulaire initialise une nouvelle saisie, comme auparavant.

## Vérification locale

Les [147 cas ciblés](local-after.json) passent, dont 35 nouveaux cas Achat. Ils couvrent 21 pages Produit et 13 pages Chantier, dernières références, recherche, sélection séparée, champs minimaux, huit rôles, agences, relations étrangères, révocations et paramètres invalides. Une création réelle dans la SQLite fictive conserve le prix modifié, les libellés et une ligne libre : total 2 768 centimes, sans mouvement ni envoi. Les anciens payloads Produit et inventaire détaillé ne sont plus transmis au navigateur ; une référence Produit étrangère volontairement liée à un dépôt de la société ne figure pas dans la réponse.

Le premier passage des 34 cas initiaux réussit ses assertions métier mais échoue au nettoyage des clients. L'ordre de suppression est corrigé, les résidus sont retirés et la recette ciblée complète est rejouée sans assouplir les tests. Les [deux fixtures navigateur](seed.json), avec 501 produits et 301 chantiers chacune, sont réellement créées, vérifiées puis supprimées : zéro société restante.

Les deux parcours compilés ordinateur/mobile passent dans les [deux CI de a01ce4c](../20261014-candidate/ci-a01ce4c.json) : pages indépendantes, choix de chantier et produit disparus/remplacés, panne/reprise, modification du coût catalogue pendant la saisie, conservation du prix personnel, retrait de la première ligne, ajout d'une ligne libre et création réelle du brouillon cohérent. Les 35 cas SQL passent aussi sur SQLite et PostgreSQL réel. La branche reste globalement incomplète et les uploads sont refusés ; ce lot réussi ne qualifie pas tout le candidat.

## Limites

Les compteurs et historiques Achats, les autres sélecteurs opérationnels et l'intégrité globale des actions d'achat restent séparés. Les contrôles d'un sélecteur ne prouvent pas que toute commande forgée ou toute modification concurrente est refusée par l'action métier. Aucun fournisseur réel, envoi, stockage durable, charge ni reprise après arrêt brutal n'est qualifié ici. La consultation hébergée reste une lecture seule et ne remplace pas la recette de création.
