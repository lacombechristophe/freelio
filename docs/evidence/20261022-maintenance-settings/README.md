# Réglages de renouvellement : version et audit

Code : ab42ad181fa0a2369d27c7b1e6002b6bc6cf887f. Enregistrer les réglages d’un contrat d’entretien pouvait écraser un accord plus récent et réussir malgré le refus de l’audit. Le rôle Service voyait la commande mais était bloqué par le droit Opérations du modèle.

La [sonde](baseline-probe.test.ts.txt), sur c369b5b, reproduit [sept observations en échec et deux témoins positifs](baseline.json) : audit, version ancienne, trois références incohérentes, successeur existant et refus du rôle Service. Ce ne sont pas sept vulnérabilités indépendantes. La fixture initiale conservait involontairement un successeur étranger ; deux cas du premier correctif n’atteignaient donc pas leur chemin attendu. Le diagnostic a été rejoué après correction de cette fixture. Le cas explicite avec successeur reste conservé ; les rapports intermédiaires figurent dans local.json.

L’[action](../../../src/actions/operations/index.ts) exige la version affichée et relit contrat, client, site, agence et relations dans la transaction. Un site d’un autre client est refusé, même dans la même société. Un terme déjà renouvelé ou possédant un successeur est figé. La mise à jour conditionnelle, l’avancement de version et l’audit obligatoire sont atomiques. Une version ancienne est refusée avec « Ce contrat a changé. Vérifiez la version actuelle avant de réessayer. » ; le formulaire conserve sa saisie après ce refus.

Le [contrôle du modèle](../../../src/lib/prisma.ts) accorde à Service uniquement les six champs de cette sauvegarde, dont updatedAt, pour le contrat et la version portés par le contexte interne de l’action. La matrice des rôles reste inchangée. Service ne reçoit pas de droit général pour modifier les prix, rattachements, états opérationnels ou supprimer un contrat. Le client ne peut pas fournir cette capacité interne. La démo publique refuse l’action avant exécution métier.

## Qualification

La [recette](local.json) passe **3 729 tests dans 285 fichiers**, sans échec ni exclusion, sur une SQLite fictive neuve. Les **31 cas dédiés** et **125 cas ciblés/voisins** passent. Un trigger SQL refuse réellement l’audit : données et version restent alors intactes. Deux sauvegardes concurrentes d’une même version produisent une seule modification et un seul audit. Ce contrôle utilise un processus et la file transactionnelle SQLite existante ; il ne qualifie pas la contention PostgreSQL ou plusieurs instances serveur.

La première suite complète de ce même code passe 3 728 cas, mais la réponse Google dépasse le délai de test de cinq secondes. Les trois réponses natives passent ensuite isolément en 649 ms, puis la suite complète est rejouée. Aucun code, assertion ou délai n’est modifié entre ces exécutions. Le premier échec reste conservé ; sa cause n’est pas établie et le résultat final ne vaut pas preuve d’absence d’intermittence.

Les tests couvrent aussi les rôles autorisés et refusés, agence révoquée, membre suspendu, absence d’authentification, démo, références étrangères, décision déjà renouvelée et entrées malformées. Les tentatives directes de modification de prix, d’un autre contrat et de suppression restent refusées même avec la capacité de réglages active.

Types, ESLint, Oxlint et build de 76 pages passent. Les 1 242 fichiers source concordent avec ce commit ; 710 versions installées correspondent au lockfile après deux normalisations de préfixe v. Les audits de l’[outillage inchangé](../20261021-test-toolchain/README.md) restent datés. Les sept contrôles générateur/PDF passent dans la suite complète ; la couverture est limitée aux six modules configurés. L’action est enregistrée dans le build, sans preuve d’invocation HTTP.

**498 cas Playwright sont sélectionnés, dont quatre nouveaux desktop/mobile ; aucun parcours applicatif n’est exécuté.** Les deux nouveaux scénarios préparent la sauvegarde Service et le conflit avec saisie conservée. Sessions et cache Next sont simulés dans les tests unitaires ; SQL, audit et contrôles de droits sont réels. Ces tests ne prouvent pas les interactions React.

## Limites et reproduction

Ce lot porte sur les réglages : création du nouveau terme, proposition contractuelle et facturation éventuelle sont des actions distinctes encore à qualifier. Aucun successeur, prix, document signé, récurrence ou facture émise n’est réécrit par cette action. Le Help Desk principal et les derniers consommateurs des caches restent distincts. PostgreSQL, Linux, navigateur, CI distante et déploiement du même SHA restent à qualifier. Aucun schéma, paquet, installation, licence ou envoi fournisseur ne change. Aucun push, fusion ou déploiement : le plafond GitHub Actions à 0 € avec arrêt de l’usage payant reste à attester.

Dans une copie déjà installée, avec configuration fictive et une DATABASE_URL SQLite neuve : préparer par `node scripts/prepare-dev-database.mjs`, puis lancer `node node_modules/vitest/vitest.mjs run tests/unit/maintenance-settings-integrity.integration.test.ts tests/unit/operations-service-directory.integration.test.ts tests/unit/asset-reference-lifecycle.integration.test.ts tests/unit/maintenance-renewal.test.ts tests/unit/public-demo-database.integration.test.ts tests/unit/public-demo.test.ts --no-file-parallelism`. La suite complète utilise run --coverage --no-file-parallelism, sans build parallèle.

Pour le diagnostic, copier la sonde sous tests/unit/maintenance-settings-integrity.integration.test.ts dans une autre recette de c369b5b, préparer une base fictive neuve et lancer ce fichier seul. Sept échecs et deux témoins positifs sont attendus.
