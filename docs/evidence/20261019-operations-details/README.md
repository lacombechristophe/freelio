# Relations des fiches Service et Achat

Le [lot approuvé](../../contrat-operations-details-relations.md) est implémenté dans [3d79096](https://github.com/lacombechristophe/freelio/commit/3d79096c90f0f2870eee02ff48ab04fe598aefc8). Les quatre lecteurs réutilisent les prédicats de société/agence de la synthèse et filtrent explicitement les relations imbriquées, qui n'héritent pas des extensions Prisma de la requête racine.

La reproduction initiale comporte douze cas : cinq réussites et sept échecs. Après correction, les 42 cas dédiés passent. Avec les suites voisines de Stock, Commandes, Finance, Sites/parc, synthèse Opérations et mesures Client Service, les sept fichiers terminent 190 cas réussis, sans échec ni exclusion. Auth.js et le cache Next sont simulés ; Prisma, les actions, contraintes et autorisations restent réels.

Le [relevé local](local.json) conserve les empreintes des rapports natifs et des sources. Un premier passage élargi s'arrête dans la création d'une fixture Achat qui mélange identifiants scalaires et écriture relationnelle Prisma : 64 cas réussis, 42 non exécutés. La fixture crée désormais son chantier séparément et nettoie ses données en cas d'échec de préparation. Ce résultat incomplet n'est pas compté comme une réussite.

TypeScript et le lint ciblé passent. La [sélection compilée](browser-selection.json) compte 436 cas, 218 par surface. Le nouveau parcours prévoit Owner puis Technician, vérifie HTML/RSC et écrans introuvables pour les quatre fiches, les agences et l'absence de mutation ou d'erreur JavaScript. Cette sélection ne prouve pas leur exécution : PostgreSQL et navigateur restent à qualifier en CI sur ce code.

La recette est fictive et isolée ; aucun fournisseur ni base existante n'est utilisé. Les limites du contrat restent applicables. Ces résultats ne qualifient pas les autres lecteurs, les mutations, la charge ou les échanges fournisseurs.
