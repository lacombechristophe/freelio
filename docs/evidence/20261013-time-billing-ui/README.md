# Limites de l'aperçu initial et du regroupement par chantier

Le [reproducteur](reproducer.test.ts.txt) et les [observations](before.json) exécutent trois cas sur le code de 06d0d7c dans la copie SQLite fictive. Session/cache et l'import de préparation d'archive sont simulés ; les lectures, édition Temps, calcul et facturation restent réels. Aucun PDF ou fournisseur n'est appelé.

Une heure chargée dans le formulaire donne 100 € HT dans son constructeur de lignes partagé. Une vraie édition à deux heures, terminée avant la soumission, produit ensuite un brouillon de 200 € HT sur le candidat du diagnostic. Le recontrôle du snapshot serveur protège une autre fenêtre, entre préparation serveur et transaction. Le [complément](../../contrat-facturation-temps-apercu-perime.md) a été approuvé le 13 octobre ; cette observation n'invalide pas les tests de la fenêtre transactionnelle.

Comptabilité lit deux temps du même client, dans deux chantiers de son agence, mais leur facture regroupée sans chantier unique devient inaccessible et est annulée. Owner réussit la même sélection à 200 € HT. Ce refus est **déjà documenté et testé** dans les 30 cas du [rattachement limité](../20261013-time-billing-accounting/README.md), pas une nouvelle vulnérabilité. Une extension complète exige des références de chantiers source persistées et une politique d'accès aux factures multi-chantiers.

Cette extension doit vérifier société et client communs, tous les chantiers et toutes les agences lors de la création puis des lectures, émission, paiement et suppression. Les anciens documents sans sources explicites restent soumis à leur règle actuelle ; leurs sources ne doivent pas être déduites d'un titre ou de temps historiques. Export, sauvegarde/restauration, archivage et facturation concurrente doivent conserver ces références. Réduire le formulaire à un seul chantier ou ouvrir tous les documents sans chantier ne terminerait pas ce parcours.

## Correctif de l'aperçu initial

Le formulaire transmet désormais les versions serveur de tous les temps sélectionnés, indépendamment des filtres affichés. Avant calcul, l'action vérifie chaque version sur les données SQL courantes ; le recontrôle transactionnel reste actif. Le refus réutilise le message approuvé sans revalidation de page et conserve la saisie. Les versions signées n'accordent aucun droit ; un retrait du rôle ou de l'agence reste effectif.

La [recette locale](local-after.json) passe les 2 030 tests de la suite, dans 207 fichiers, dont 21 nouveaux cas pour l'aperçu initial et les 17 cas de la fenêtre transactionnelle. Les pourcentages de couverture concernent uniquement les six modules configurés. Session/cache et préparation d'archive sont simulés dans ces suites SQL ; les actions, calculs et transactions sont réels. Types, linters et build passent. La qualification distante doit être reliée au nouveau candidat avant d'affirmer une CI verte.

Le [test compilé](../../../tests/e2e/time-invoice-preview.spec.ts) est prévu sur ordinateur et mobile : afficher 100 € HT, masquer la sélection par le filtre de chantier, terminer une édition SQL fictive à deux heures avant le clic, refuser sans facture ni audit, conserver les cinq saisies et la sélection, puis créer 200 € HT seulement après rechargement. Ce test n'est ni une simulation de l'action, ni un essai fournisseur réel.

## Qualification de 12d3aa7

Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38394310079) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38394315597) sont vertes. Les [rapports](../20261013-candidate/ci-12d3aa7.json) confirment 2 030 tests SQLite, 2 029 PostgreSQL et une exclusion native SQLite, 363 E2E et 19 exclusions historiques dans chaque run, neuf contrôles Linux et deux audits sans vulnérabilité. Les 21 nouveaux cas PostgreSQL et les deux E2E d'aperçu initial passent sans exclusion ; les 17 cas de la fenêtre transactionnelle restent actifs.

Le navigateur compilé exécute le parcours décrit ci-dessus sur les deux surfaces, jusqu'au brouillon de 200 € HT et à son audit unique. La [preview en lecture seule](../20261013-candidate/hosted-12d3aa7.json) passe séparément 49 pages/onglets par surface ; elle ne contient pas ces mutations fictives. L'[identité du code](../20261013-candidate/source-12d3aa7.json) relie ce candidat au merge réellement testé.
