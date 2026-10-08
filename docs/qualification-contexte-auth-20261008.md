# Requêtes différées et contexte d’autorisation, 8 octobre 2026

Un callback de `withAuth` pouvait retourner directement une promesse Prisma différée. Son exécution commençait après la sortie de `requestContext.run`, et le DAL ne recevait alors plus rôle, société ni permission d’action. Le [même test SQL](evidence/20261008-auth-context/README.md) reproduit sept échecs avec l’ancien wrapper puis sept réussites après correction.

Le wrapper attend maintenant le résultat du callback à l’intérieur du contexte. Aucun rôle ni droit n’est ajouté. Les contrôles incluent cinq refus d’écriture, une lecture limitée à sa société et une écriture Owner refusée vers une autre société. Les erreurs attendues sont précises ; une exception arbitraire ne suffit pas. Session simulée, vrais membership, contraintes et DAL ; deux sociétés fictives nettoyées après chaque recette.

Le lot Suivi client ajoute séparément une exception DAL pour une mise à jour simple de ses six champs non financiers avec `service.write`. Elle n’autorise ni édition générale, montant, relation imbriquée, écriture groupée ou mutation depuis `service.read`. Cette exception ne remplace pas la validation de société et du responsable dans l’action.

La recette ciblée passe en SQLite, puis la suite commune réussit 1 020 tests / 163 fichiers en 232,07 secondes, types, ESLint et Oxlint. Build, PostgreSQL et navigateur du nouveau candidat restent à qualifier. Les CI vertes de 653cddc précèdent ce changement et ne lui sont pas attribuées. Aucun envoi, fournisseur réel ni donnée de l’instance existante n’est utilisé ; cette régression ne clôture pas toutes les entrées ou tous les modèles du CRM.

Le build de 75 pages et les deux validations de schéma réussissent ensuite ; PostgreSQL réel et navigateur restent à qualifier dans la CI du nouveau candidat.
