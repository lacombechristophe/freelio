# Droits Finance des actions bancaires

## Défaut reproduit

Le 8 octobre 2026, la recette appelle directement `getBankingDashboard` avec une session fictive et une adhésion réelle en SQL. Le wrapper d’authentification reste réel ; seul le fournisseur de session est simulé. Les rôles SALES, OPERATIONS, TECHNICIAN et SERVICE obtiennent les mouvements bancaires alors qu’ils ne possèdent pas `finance.read`. La restriction d’un écran ne sécurise pas une Server Action invoquée directement.

Les quatre mutations ne demandent pas non plus explicitement `finance.write` avant leur traitement. L’extension Prisma protège déjà leurs écritures : la recette ne démontre **aucune écriture interdite réussie**. Elle montre un contrôle tardif, après validation ou recherche de documents, à rendre cohérent avec celui des dépenses et factures.

## Correction limitée

Ajouter `finance.read` au wrapper de lecture et `finance.write` aux quatre wrappers de mutation. Les mêmes permissions, messages d’autorisation et refus de démo existants s’appliquent avant le traitement métier. Aucun écran, champ, bouton, couleur, libellé ou calcul bancaire ne change. OWNER, ADMIN, ACCOUNTING et VIEWER conservent la lecture prévue par la matrice ; VIEWER ne reçoit aucun droit d’écriture.

La revue de cohérence reproduit ensuite le même défaut sur `getAccountingSnapshot` : les quatre rôles sans Finance obtiennent la synthèse comptable. Le même `finance.read` est ajouté à cette seule entrée financière. Huit assertions supplémentaires vérifient quatre refus et la conservation de lecture pour les quatre rôles autorisés ; avant ce complément, seuls les quatre refus échouent sur 25 cas.

Le [test SQL](../tests/unit/banking-permissions.integration.test.ts) vérifie les quatre refus de lecture, les quatre rôles lecteurs, les quatre mutations refusées au lecteur, une adhésion révoquée malgré la session et les quatre mutations interdites en démo publique. Les données sont fictives et nettoyées. Avant correction, 11 des 17 assertions échouent ; après correction, les 17 passent. Avec les recettes d’autorisations des factures/contrats et dépenses : **29 tests réussis dans trois fichiers** (4,58 s). Typage et lint ciblé passent ; la suite complète, le build et la CI du nouveau candidat restent à consigner.

Après ajout des huit cas de synthèse comptable et de sa garde, la recette finale réussit **772 tests dans 147 fichiers** (130,38 s), typage et lint complets. Les 25 cas de ce fichier sont inclus. Le build et la qualification CI du nouveau candidat restent distincts ; les résultats CI de e673342 précèdent cette correction.

Le build final réussit ensuite : compilation 20,4 s, typage Next 10,9 s, 74 pages générées. Schéma PostgreSQL valide avec une URL fictive, sans connexion ; découverte de 154 tests E2E dans 33 fichiers, sans lancement de navigateur local. Seule la CI du nouveau SHA peut ajouter la qualification PostgreSQL et navigateur de ce complément.

## Limites

Cette preuve porte sur les vraies actions, l’authentification d’adhésion et SQLite, sans navigateur ni serveur HTTP local. PostgreSQL doit qualifier ce nouveau test en CI. Elle ne ferme pas le rapprochement bancaire : pagination complète, import concurrent, courses de rapprochement et de paiement restent à qualifier séparément. Une hypothèse de concurrence issue de la revue n’est pas présentée comme un défaut reproduit. Les tableaux de bord transversaux ne sont pas modifiés dans ce correctif ; leur politique de projection des indicateurs doit être examinée séparément avant toute évolution visible.
