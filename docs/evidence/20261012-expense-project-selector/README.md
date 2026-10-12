# Sélecteur de chantier des dépenses

Le [diagnostic](before.json) reproduit deux faits sur `780a24f` : un sélecteur de 100 lignes sur 101 chantiers, puis la perte du client lors d'une édition qui conserve le chantier. Les deux cas passent en reproduisant ces défauts, pas en validant leur correction. Le second appelle la vraie action depuis la projection exacte du payload du formulaire, sans prétendre exécuter le navigateur.

Le [reproducteur étendu](reproducer.test.ts.txt) ajoute le cas d'une dépense liée directement à un client, sans chantier. Ses trois cas passent en constatant ces défauts ; le corps de l'action d'édition est comparé à `780a24f`. Copier ce fichier dans `tests/unit/` d'une recette isolée de cette version pour le rejouer avec Vitest.

Le [contrat approuvé](../../contrat-depenses-choix-chantier.md) fixe le lecteur minimal, la pagination, la sélection indépendante et le blocage d'une sauvegarde non vérifiée. La [qualification locale](local.json) conserve empreintes, commandes, composants réels et limites. Les 23 cas SQL et les six parcours E2E restent distincts ; un chargement Playwright ne vaut pas exécution.

La [PR #8](https://github.com/lacombechristophe/freelio/pull/8) identifie le commit publié, la fusion testée, les deux CI et la recette hébergée. Leurs résultats ne sont pas déduits d'une recette antérieure. Les limites portent notamment sur le stockage et les fournisseurs réels, la charge hébergée et une révocation pendant une requête déjà autorisée.
