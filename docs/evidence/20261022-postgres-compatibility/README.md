# Reprise des conflits PostgreSQL et stabilité des imports

Le [run du candidat `9f09bd5`](https://github.com/lacombechristophe/freelio/actions/runs/39855959357) applique les migrations mais termine sa suite PostgreSQL avec **3 902 réussites, dix échecs et une exclusion historique**. Les neuf contrôles natifs Linux réussissent ; leur publication échoue séparément sur le quota d’artefacts. Ces résultats ne sont pas une CI verte.

Les commits `48d510d`, `2720a02` et `be58e1f` traitent les causes observées :

- Les préparations de contrat, commande et proposition d’entretien peuvent relire leur source après une transaction explicitement annulée par la base. La reprise est bornée et activée pour ces trois opérations SQL seulement. Les codes Prisma `P2034` et les SQLSTATE PostgreSQL `40001` / `40P01` transportés par `P2010` sont reconnus. Timeout, erreur métier ou résultat de connexion inconnu ne sont pas rejoués. Les quotas d’envoi utilisent aussi une attente bornée entre essais ; aucun appel fournisseur n’est repris par ce mécanisme.
- La réservation garde son verrou de dépôt et ses refus existants. Le harnais de concurrence coordonne maintenant les deux requêtes **avant ce verrou** : il attendait auparavant deux lectures de stock derrière un verrou qui les sérialise. Les assertions sur les quantités persistées, les mouvements et l’unique effet terminal sont conservées.
- L’import d’une réception privilégie une ligne portant le produit recherché, puis départage les positions identiques par identifiant. Une ligne libre ne peut plus être choisie arbitrairement au rejeu. Le test vérifie le rattachement au produit et l’absence d’imputation sur la ligne libre.
- Le test des 10 001 créneaux conserve toutes ses assertions de résultat et de taille de réponse. Son délai de 30 secondes inclut l’insertion des fixtures PostgreSQL ; la durée de lecture est observée séparément, sans engagement de performance.

## Qualification locale

La [preuve](local.json) porte sur `be58e1fb5f94450f5f5fe461edabdea32f8f42b2` : **246 tests ciblés dans dix fichiers** passent dans une SQLite fictive neuve. Les sept cas d’import sont rejoués après la dernière précision d’assertion ; ils ne s’ajoutent pas au total de 246. Types, ESLint/Oxlint et build Next.js 16.4.2 de 76 pages passent. La recette correspond à 1 257 fichiers Git et 710 versions installées ; dépendances et schéma sont inchangés depuis la [qualification Next](../20261022-next-security/README.md).

Treize cas supplémentaires vérifient la classification des conflits, l’activation explicite et l’épuisement de la reprise. **Aucune nouvelle suite complète ni exécution PostgreSQL n’est revendiquée à ce stade.** Les tests SQL existants doivent confirmer ces corrections sur PostgreSQL dans la nouvelle CI. Les résultats complets du commit `55b5ac5` restent datés.

Reproduction : dans une copie installée du commit, avec secrets fictifs et SQLite neuve, préparer la base puis lancer Vitest sur `document-numbering-core`, `numbering`, `email-send-quotas`, `maintenance-proposal-integrity`, `maintenance-signing-integrity`, `quote-contract-conversion`, `quote-order-conversion`, `stock-reservation-concurrency`, `warehouse-import-lifecycle` et `operations-service-directory`, avec leurs suffixes `.test.ts` / `.integration.test.ts` et `--no-file-parallelism`. La CI PostgreSQL doit appliquer les migrations versionnées sur son service fictif, puis exécuter la suite complète.

## Artefacts et déploiement

Le nettoyage déjà autorisé est terminé : 256 suppressions et treize archives déjà absentes, aucune des 269 références encore présente. L’inventaire du 22 octobre conserve 292 petits artefacts natifs, environ 7,2 Mo. GitHub refuse encore les uploads ; aucune autre archive n’a été supprimée et le contrôle de publication des preuves reste bloquant.

La preview de `9f09bd5` a été construite après correction de l’attribution GitHub du commit. Son état `READY` ne prouve ni migrations distantes ni parcours authentifiés. Les nouveaux commits nécessitent leur propre CI et preview avant fusion.
