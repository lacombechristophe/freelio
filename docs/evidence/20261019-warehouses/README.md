# Gestion et activité des dépôts

Deux commits séparent la frontière transactionnelle du stock (`fe1f1ad`) et le parcours de gestion (`3836dc4`). La [portée fonctionnelle](../../gestion-depots.md) décrit les droits, versions et refus ; le [relevé local](local.json) conserve les résultats et les empreintes des rapports natifs.

## Résultats

La reproduction initiale comprend six témoins réussis et sept refus manquants : un mouvement préparé continue après la désactivation du dépôt. Les 23 contrôles de stock/import passent après correction. Les 22 contrôles de gestion ajoutent recherche sur 203 dépôts, dernière page, coordonnées, code unique, versions concurrentes, sociétés/agences, droits, stock, réservations et démonstration publique. Avec deux suites d'import existantes, les cinq fichiers terminent 58 cas réussis.

Le commit `3836dc4139e778bc7a6c99763116d6e340cf4644` passe ensuite la suite SQLite complète sur une nouvelle base fictive : **2 501 tests, 228 fichiers, aucun échec ni exclusion**. Les six modules configurés passent les seuils de couverture conservés : 84,06 % des instructions, 61,63 % des branches, 86,95 % des fonctions et 87,15 % des lignes. Ce périmètre ne mesure pas toute l'application.

TypeScript, ESLint, Oxlint et le build de production passent. Le build génère ses 76 pages statiques et contient la nouvelle route dynamique `/dashboard/operations/depots`. La recette compare 1 086 fichiers source au commit, avec normalisation CRLF annoncée et aucune différence ; les exclusions documentaires et d'environnement sont explicites dans le relevé.

## Tentatives conservées

Trois assertions de rejeu d'import comparaient aussi les révisions `updatedAt`, légitimement renouvelées. Les assertions corrigées conservent la vérification des identifiants et valeurs métier ; les premiers résultats restent référencés. Un premier passage complet conserve 2 472 assertions réussies mais reste en échec : les 29 cas Stock n'ont pas pu charger un fichier Next absent. Il n'est pas compté comme un passage complet.

La copie de dépendances de la recette était partielle. Les fichiers manquants ont été restaurés depuis les archives déjà présentes dans le cache npm, après vérification des signatures du lockfile, sans réseau, installation, script de paquet ni écrasement d'un fichier existant. Les builds incomplets et anciens répertoires de compilation sont conservés. Deux anciens diagnostics externes qui faisaient échouer le lint ont été déplacés hors de la recette et vérifiés par SHA-256 ; aucune règle n'a été assouplie. Deux synchronisations concurrentes ont aussi échoué avant leurs contrôles ; les relances utilisent une synchronisation unique puis des commandes directes.

## Limites

Les tests SQL simulent Auth.js et le cache Next selon leurs fichiers ; les actions, contraintes et transactions Prisma sont réelles. Les données restent fictives et isolées. Aucun fournisseur, envoi, abonnement ni environnement partagé n'est utilisé.

La sélection navigateur compte 440 cas, 220 par surface, dont le nouveau parcours Dépôts. **Il s'agit d'une sélection, pas d'une exécution.** PostgreSQL et les navigateurs compilés des nouveaux commits restent à qualifier. Aucun push, workflow ou déploiement supplémentaire n'est déclenché tant que le plafond de dépenses GitHub Actions à 0 € n'est pas vérifié. Les résultats distants de `8d22323` ne qualifient pas ce complément.
