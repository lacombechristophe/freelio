# Relations des fiches Service et Achat

Le [lot approuvé](../../contrat-operations-details-relations.md) est implémenté dans [3d79096](https://github.com/lacombechristophe/freelio/commit/3d79096c90f0f2870eee02ff48ab04fe598aefc8). Les quatre lecteurs réutilisent les prédicats de société/agence de la synthèse et filtrent explicitement les relations imbriquées, qui n'héritent pas des extensions Prisma de la requête racine.

La reproduction initiale comporte douze cas : cinq réussites et sept échecs. Après correction, les 42 cas dédiés passent. Avec les suites voisines de Stock, Commandes, Finance, Sites/parc, synthèse Opérations et mesures Client Service, les sept fichiers terminent 190 cas réussis, sans échec ni exclusion. Auth.js et le cache Next sont simulés ; Prisma, les actions, contraintes et autorisations restent réels.

Le [relevé local](local.json) conserve les empreintes des rapports natifs et des sources. Un premier passage élargi s'arrête dans la création d'une fixture Achat qui mélange identifiants scalaires et écriture relationnelle Prisma : 64 cas réussis, 42 non exécutés. La fixture crée désormais son chantier séparément et nettoie ses données en cas d'échec de préparation. Ce résultat incomplet n'est pas compté comme une réussite.

TypeScript et le lint ciblé passent. La [sélection compilée](browser-selection.json) compte 436 cas, 218 par surface. Le nouveau parcours prévoit Owner puis Technician, vérifie HTML/RSC et écrans introuvables pour les quatre fiches, les agences et l'absence de mutation ou d'erreur JavaScript. Cette sélection ne prouve pas leur exécution : PostgreSQL et navigateur restent à qualifier en CI sur ce code.

La recette est fictive et isolée ; aucun fournisseur ni base existante n'est utilisé. Les limites du contrat restent applicables. Ces résultats ne qualifient pas les autres lecteurs, les mutations, la charge ou les échanges fournisseurs.

## Changements d'état des interventions

Le complément `639f231` protège deux écritures : changement d'état d'une intervention et résolution d'une réserve. Leurs relations sont vérifiées à la lecture puis dans le prédicat de mise à jour. Le périmètre d'agence et l'affectation exigée pour le technicien restent appliqués. Une réserve déjà résolue garde sa date ; deux appels concurrents ne produisent qu'une mise à jour et un audit. Ce complément reste distinct des quatre lecteurs ci-dessus.

Le [relevé](intervention-state.json) conserve cinq témoins réussis et huit refus manquants avant correction. Les seize cas dédiés passent ensuite, dont deux intercalages avant écriture et un double appel. Avec les sept suites voisines, la commande prévue par `test:unit` termine 206 cas dans huit fichiers sans échec ni exclusion. TypeScript et le lint ciblé passent. Les premiers appels directs avaient omis `--no-file-parallelism` : leurs échecs et blocages SQLite restent conservés ; les délais, assertions et commande du dépôt ne sont pas modifiés.

La sélection navigateur passe à 438 cas, 219 par surface. Le nouveau parcours prépare une intervention cohérente, rend son chantier inaccessible après affichage, vérifie le refus sans mutation puis le démarrage après rétablissement. Il est préparé sans être déclaré exécuté. PostgreSQL et navigateur du complément restent à qualifier ; aucune nouvelle CI n'est déclenchée tant que le plafond de dépenses GitHub n'est pas vérifié.
