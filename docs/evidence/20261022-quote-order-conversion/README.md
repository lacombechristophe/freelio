# Devis accepté : création de la commande

Code : `6ac806173d267189c93e914446f052eb8544b1af`. Le [diagnostic sur eb8047f](baseline.json) reproduit cinq défauts : refus du parcours Commercial pourtant proposé, commande/chantier conservés après un échec d’audit, choix d’une version différente de `currentVersion`, acceptation périmée pendant la préparation du numéro et création depuis un aperçu périmé. La [sonde exacte](baseline-probe.test.ts.txt) est conservée avec son empreinte.

L’[action de conversion](../../../src/lib/operations/quote-conversion.ts) relit le devis, son état, ses versions et ses références dans une transaction sérialisable. Pour une nouvelle commande, elle exige la révision du contenu affiché, une version courante non ambiguë, un chantier actif accessible et des montants représentables. Commande, éventuelle création/rattachement d’un chantier et audits obligatoires sont validés ensemble. Un refus d’audit annule leurs écritures. Aucun prix n’est recalculé depuis le catalogue : quantités fractionnaires et montants du devis sont conservés, même après désactivation d’un produit de la société ou changement du réglage de TVA.

Commercial reçoit uniquement la capacité de créer la commande revendiquée par cette action. Il ne peut pas créer librement un chantier, modifier/supprimer une commande, agir sur le stock ou facturer. Un rôle limité aux agences doit disposer d’un chantier explicite accessible. Owner/Admin peuvent toujours créer le chantier manquant ; sa date suit le calendrier de la société. Un nouvel essai retrouve une commande cohérente sans la modifier ni ajouter d’audit, même si le premier résultat a été perdu.

Le formulaire conserve la révision à son ouverture et ses saisies après refus ; ses champs sont figés pendant l’envoi. Le texte d’aide précise que l’acompte est prévu sur la commande. Cette action ne prépare ni n’émet de facture. La création du contrat optionnel reste une action séparée après la conversion ; le dossier complet avec contrat n’est donc pas annoncé atomique.

## Qualification

La [recette locale](local.json) passe **3 552 tests dans 279 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve avec couverture. Les **32 cas dédiés** et les cinq cas du diagnostic réussissent dans cette exécution ; **114 cas ciblés et voisins** passent aussi séparément. Le manifeste exécuté correspond aux fichiers du commit. Les 1 222 fichiers source sont conformes et 710 versions installées correspondent au lockfile après normalisation de deux préfixes `v` Upstash. Types, ESLint, Oxlint et build de 76 pages passent.

Le diagnostic initial utilisait un marqueur de révision que l’ancien schéma ignorait, car le lecteur n’en fournissait aucune. Les tests finaux exigent une véritable révision de 64 caractères obtenue par `getQuoteById`, y compris pour les refus d’audit et de version. Leur réussite ne repose donc pas seulement sur le refus d’un jeton absent. Les cas positifs vérifient notamment les lignes copiées, les montants, la date d’accord, les deux audits du chantier généré et la reprise. Deux appels concurrents dans le même processus SQLite n’ont créé qu’un dossier ; cela ne qualifie pas la contention PostgreSQL entre connexions.

Les actions, droits, adhésions, SQL et déclencheurs de refus sont réels ; authentification et cache Next sont simulés. Les sept contrôles générateur/PDF passent dans la suite complète. La couverture ne porte que sur les six modules configurés. Les fichiers package et lockfile restent inchangés depuis la [qualification datée de l’outillage](../20261021-test-toolchain/README.md), dont les audits à zéro sont réutilisés avec cette limite.

**474 cas Playwright sont sélectionnés, dont deux nouveaux pour la conversion sur desktop/mobile ; aucun parcours applicatif n’est exécuté.** Ces deux cas préparent le refus d’un contenu devenu périmé, la conservation du taux/date, puis la reprise après rechargement. PostgreSQL, Linux, invocation HTTP compilée et preview du même SHA restent à qualifier.

Ce lot ne garantit pas l’existence d’un instantané historique de l’accord sur le devis. Édition/annulation après confirmation ou livraison, réparation historique et création du contrat restent distinctes. Aucun schéma, dépendance ou licence modifié ; aucune installation, émission/envoi métier, fusion ou publication. Le push et la nouvelle CI attendent l’attestation du plafond GitHub Actions à 0 €.

## Reproduction

Dans une copie isolée déjà installée, avec secrets fictifs et une `DATABASE_URL` SQLite neuve, préparer la base par `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/quote-order-conversion.integration.test.ts tests/unit/customer-order-delivery.integration.test.ts tests/unit/document-read-scope.integration.test.ts tests/unit/permissions.test.ts --no-file-parallelism`. La suite complète utilise `run --coverage --no-file-parallelism`, sans build parallèle.

Pour le diagnostic, prendre une autre copie isolée de `eb8047f`, y copier la sonde conservée sous `tests/unit/quote-order-conversion.integration.test.ts`, préparer une nouvelle base fictive et lancer ce seul fichier. Les cinq échecs sont attendus.
