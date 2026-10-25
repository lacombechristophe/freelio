# Banque et gestion des fournisseurs

## Résultat du candidat ff3b0f3

La [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37767742082) réussit : 875 tests SQLite, 874 PostgreSQL et une exclusion native SQLite, 145 parcours navigateur réussis et 19 exclusions historiques. Les neuf contrôles Linux et les audits production/complet passent. La couverture ciblée reste à 86 % des lignes et 58,17 % des branches ; elle ne mesure pas toute l’application.

La [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37767747724) échoue sur le premier dépôt CSV du parcours Banque ordinateur : aucun bouton Importer après sélection. Les 875 tests, PostgreSQL et Linux passent. L’audit UI de cette PR couvre 64 routes par format et ne rapporte aucun finding P0–P3 ; il ne transforme pas l’échec du parcours CSV en succès. Ce résultat empêche de qualifier ff3b0f3 comme candidat entièrement vert, malgré le succès de branche.

Le rendu de la page est présent, mais les lignes du CSV sont absentes. Une sélection native avant attachement du gestionnaire React est une hypothèse cohérente avec la trace. Le client relit désormais la sélection existante au montage. Un nouveau parcours retient les scripts du client, choisit un CSV fictif, puis libère les scripts et vérifie son traitement. Il ne retente pas le dépôt et ne masque aucune erreur. La validation de ce correctif reste à obtenir en CI.

## Lot Fournisseurs approuvé

L’annuaire et les trois sélecteurs lisent des pages de 25 sur le portefeuille complet de la société. Le choix est relu séparément, même hors recherche/page. Un fournisseur inactif n’est accessible dans le sélecteur d’édition que s’il est déjà rattaché au produit courant.

Les huit champs de la fiche sont modifiables. Une révision `updatedAt` accompagne le formulaire ; une écriture concurrente refuse son écrasement et conserve la saisie. Nom/code restent uniques en SQL, les champs vides deviennent null et le délai vide ne devient pas zéro. L’audit d’édition contient les noms des champs modifiés, sans leurs valeurs.

La désactivation conserve les références. Les nouveaux achats et produits prennent un verrou conditionnel sur le fournisseur actif dans leur transaction ; ce verrou conserve sa révision. Une désactivation concurrente précède donc la création ou attend son commit. La recette ne prétend pas reproduire une charge concurrente PostgreSQL. L’édition d’un produit déjà lié peut garder son fournisseur inactif ; un autre produit ne peut pas l’acquérir.

Recette locale isolée : **23 tests SQL fournisseurs**, neuf tests de lectures par agence, **907 tests dans 155 fichiers**, types, ESLint et Oxlint réussis. Le build compile et génère **75 pages**. La découverte de **172 E2E / 39 fichiers** vérifie leur chargement uniquement. Les nouveaux parcours Fournisseurs et CSV nécessitent encore leur exécution GitHub.

La première recette ciblée réussissait ses 32 assertions, mais échouait au nettoyage du compte fictif à cause de son journal d’audit. Le nettoyage supprime maintenant ce journal avant le compte ; les mêmes assertions passent, sans changement de délai ni exclusion.

Une répétition complète sur Windows échoue ensuite avant les neuf assertions du studio Automatisations : sa préparation par insertions individuelles dépasse les dix secondes du hook (898 autres tests réussis). Le commit **bcb8441** crée les mêmes 101 modèles/suppressions, 201 séquences/scénarios et 26 inscriptions par lots puis les relit dans leur ordre initial. Les neuf assertions passent en recette ciblée ; le délai et les tests ne changent pas. La nouvelle qualification complète réussit ses **907 tests / 155 fichiers en 150,18 secondes**, ainsi que types, ESLint et Oxlint.

Contrat : [gestion des fournisseurs](contrat-fournisseurs-gestion.md). Tests : [SQL](../tests/unit/supplier-management.integration.test.ts), [navigateur](../tests/e2e/supplier-management.spec.ts), [Banque](../tests/e2e/banking-history.spec.ts). Les historiques plafonnés de la fiche, autres référentiels et concurrence financière restent ouverts. Aucun fournisseur, mail, secret ou jeu de données existant n’est utilisé.

## Qualification CI de 1e5e3bc

La [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37773059619) et la [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37773066937) réussissent. La branche exécute 907 tests SQLite, 906 PostgreSQL et une exclusion native SQLite, puis 151 parcours navigateur réussis et 19 exclusions historiques. Les nouveaux parcours Fournisseurs et les trois parcours Banque passent dans chaque format, notamment le CSV choisi avant hydratation. Les neuf contrôles Linux, types, les deux moteurs de lint, build et audits de dépendances réussissent.

Les rapports UI de branche couvrent **65 routes par format**, sans finding P0–P3. Ce résultat remplace le statut CI en attente pour ce lot ; il ne qualifie pas les commits ultérieurs d’import concurrent ou d’historiques fournisseurs. La PR reste en brouillon et cette référence n’est pas déployée.
