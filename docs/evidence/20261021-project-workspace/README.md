# Dossier chantier : références, versions et audit

Code applicatif : `e325c309d590ed28cecbce28ec7273daf60b53a9`. Ce complément porte sur huit actions du dossier : création, état, planification et suppression d’un jalon ; création, état et suppression d’une réception ; enregistrement du relevé technique. Il complète le [cycle de vie du chantier](../20261021-project-lifecycle/README.md).

Les [actions](../../../src/actions/projets/index.ts) exigent Opérations en écriture avant lecture métier. Une transaction sérialisable relit le chantier et ses références dans le périmètre société/agence, verrouille sa ligne, vérifie la version de l’enfant puis conserve ensemble mutation et audit obligatoire. Une révision périmée, un lien étranger ou un refus d’insertion d’audit ne laisse aucune mutation partielle. Les versions avancent même si l’horloge ne change pas. Le relevé ne peut être créé avec une version vide que s’il n’existe pas encore.

Un responsable nouvellement choisi doit avoir une adhésion active dans la société. Un ancien responsable inactif de cette société peut rester attaché à son historique. Les prérequis doivent appartenir au même chantier ; leur parcours contrôle aussi responsable et étape de modèle, sans boucler sur un ancien cycle. L’ordre d’un nouveau jalon utilise le maximum existant. La suppression détache explicitement les dépendants du même chantier et les inscrit dans l’audit. Elle refuse un dépendant d’un autre chantier ou d’une autre société ; la suppression du chantier partage ce contrôle pour empêcher les effets transversaux de `SET NULL`.

Le lecteur refuse un chantier rattaché à un modèle étranger et ne renvoie pas les identifiants des relations enfants inaccessibles. Le dossier cohérent reste lisible avec une mention de référence indisponible. Les commandes suivent les droits courants, la démo en lecture seule et l’état d’enregistrement. Les versions affichées sont transmises aux actions ; un refus conserve la saisie. Le relevé présenté vient des valeurs enregistrées, et l’ouverture de son éditeur capture leur version.

Les dates sans heure sont validées comme jours calendaires, conservées à midi UTC et rendues explicitement en UTC. Les décalages de modèles utilisent des jours UTC ; leur jour de départ par défaut suit le fuseau de service de la société. Les anciennes dates ne sont pas réécrites.

## Diagnostic et qualification

Le [diagnostic](baseline.json) conserve les résultats intermédiaires, y compris les échecs de la sonde. Sur `bee583a`, ses 24 assertions échouent : huit mutations via un client étranger, huit refus d’audit, trois lectures, deux états invalides et trois dates impossibles. Ce ne sont pas 24 vulnérabilités indépendantes. La [sonde initiale exacte](baseline-probe.test.ts.txt) est conservée avec son empreinte. Les tests finaux fournissent des révisions valides pour ne pas confondre protection des relations et refus d’un jeton absent.

Deux témoins SQL supplémentaires ont observé un `dependsOnId` étranger réellement passé à `null` après suppression. Deux autres ont reproduit des références d’étape de modèle étrangères. Le défaut d’affichage du jour est reproduit par rendu React statique dans deux fuseaux, sans navigateur applicatif. Un essai de spy incompatible avec le proxy Prisma est classé comme défaut du harnais, séparément des défauts produit.

La [recette initiale sur e325c30](local.json) passe **3 481 tests dans 276 fichiers**, sans échec ni exclusion, dont les 71 cas SQL dédiés, quatre rendus statiques et 98 voisins. Types, ESLint, Oxlint et build de 76 pages passent ; 1 215 fichiers source correspondent au commit. Cette exécution utilisait encore Vite 8.3.0. La [qualification de l’outillage corrigé](../20261021-test-toolchain/README.md) consigne séparément le nouveau lockfile et son exécution complète.

Les tests SQL utilisent les vraies actions, adhésions, contraintes et déclencheurs de refus d’audit ; authentification et cache sont simulés. Les intercalages sont déterministes. **470 cas Playwright sont sélectionnés, dont deux pour ce dossier, mais aucun parcours applicatif n’est exécuté dans cette qualification.** Couverture limitée aux six modules configurés ; concurrence PostgreSQL, Linux, hydratation et interactions navigateur restent distincts. Ce lot n’a ni migration ni sortie fournisseur. Il ne qualifie pas l’administration des modèles ni tous les anciens lecteurs de Chantiers.

## Reproduction

Dans une copie isolée installée, avec une `DATABASE_URL` SQLite neuve et des secrets fictifs, lancer `node scripts/prepare-dev-database.mjs`, puis :

```powershell
node node_modules/vitest/vitest.mjs run tests/unit/project-workspace-integrity.integration.test.ts tests/unit/project-workspace-view.test.ts tests/unit/project-lifecycle-integrity.integration.test.ts tests/unit/shared-client-readers.integration.test.ts tests/unit/project-technical-profile.test.ts --no-file-parallelism
```

Pour retrouver le diagnostic initial, utiliser une autre copie isolée du code `bee583a`, y copier la sonde conservée sous `tests/unit/project-workspace-integrity.integration.test.ts`, préparer une nouvelle base fictive et exécuter ce seul fichier. Les 24 échecs sont attendus sur cette référence.
