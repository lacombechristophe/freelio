# Dépendances du candidat Next 16.3.8 et studios

Contrôle du 8 octobre 2026, avant le push de qualification de la PR #8. Source applicative **151007b**, comprenant le correctif Next **e9c2519** et la restriction des commandes de reprise en démo publique **39bc392**. Les résultats locaux portent sur la copie physique isolée, sans données ni secrets existants. Ils ne constituent pas une preuve d’exécution navigateur ou fournisseur.

Lockfile SHA-256 : `62f9faaf34e1a078981dcb8bd020d68b65c566b4f8d9c43d39eaefe151b3df39`.

- [Inventaire](dependencies.json), généré par `node scripts/inventory-dependencies.mjs` : 863 entrées, 40 métadonnées à examiner, aucune licence inconnue. Les textes de licence, assets et composants système restent à examiner séparément.
- [Audits résumés](audits.json) : lockfile et installation effective de recette, production zéro ; audit complet cinq paquets hauts de développement. La sortie brute n’est pas publiée.

Reproduction : `npm audit --omit=dev --package-lock-only --json`, `npm audit --package-lock-only --json`, puis les mêmes contrôles sans `package-lock-only` dans une installation physique issue de `npm ci`. Npm interroge des avis évolutifs ; un résultat ultérieur peut différer sans changement du lockfile.

La [qualification Next](../../qualification-next-20261008.md) donne les six avis et le choix du correctif minimal. L’[index de qualification](../../completude-recette-20261003.md) et le [contrat des listes](../../contrat-listes-automatisations-completes.md) donnent la portée fonctionnelle, les tests SQL et la CI attendue. Les contrôles restent bloquants ; aucune alerte n’est masquée.
