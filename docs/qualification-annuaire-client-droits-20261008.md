# Annuaire Client : droits Finance et export, 8 octobre 2026

Les deux lecteurs CRM de l’annuaire retournaient CA et impayé sans `finance.read`. Le [complément approuvé](contrat-annuaire-client-droits.md) conserve les colonnes et commandes, mais renvoie des montants indisponibles sans ce droit. Les agrégats de factures ne sont alors pas exécutés, et les compteurs mis en cache sont remplacés par `null`.

Avec Finance, les agrégats suivent société et agences actuelles et excluent les documents locaux liés à un projet étranger. Les tris/filtres calculés utilisent les valeurs autorisées avant pagination. Sans Finance, ils opèrent sur `null` : aucun classement sur un montant caché, aucune comparaison numérique positive, ordre stable par identifiant. Les tests de valeur renseignée reflètent cette indisponibilité.

Les cellules et le CSV affichent « Accès Finance requis ». Les nombres autorisés gardent leur format d’origine. Sur mobile, les colonnes financières restent masquées par le CSS existant ; le CSV et les données DOM appliquent la restriction. Aucun nouveau champ mobile ni changement de disposition n’est ajouté.

## Régression

La recette initiale reproduit six échecs parmi huit cas sur 3be747d. La même suite étendue de trente cas produit ensuite vingt échecs sur les lecteurs précédents et trente réussites avec le correctif. Les substitutions historiques ont lieu uniquement dans la copie de recette, puis les fichiers courants sont restaurés. Les [empreintes et cas](evidence/20261008-client-directory/expanded.json) sont conservés sans rapport SQL brut.

Session et cache Next simulés ; membership, agences, relations, DAL et SQL réels. Deux sociétés, deux clients locaux, factures payées/partielles, autre agence et relations historiques incohérentes. Les cas vérifient rôles autorisés/refusés, absence de requête financière sans droit, compteurs périmés, douze comparaisons masquées, classement stable, valeur indisponible, agence retirée/désactivée, membre suspendu, client étranger et démo. Le spy de requête laisse exécuter la méthode originale ; il ne fabrique aucune donnée SQL.

```sh
npm run test:unit -- tests/unit/client-directory-permissions.integration.test.ts
```

Employer une recette isolée avec base neuve, lockfile et secrets fictifs. Les parcours CSV Owner/Commercial/Technicien sont préparés sur ordinateur/mobile dans les sociétés de recette Client séparées. PostgreSQL et navigateur restent à qualifier sur le nouveau candidat ; découverte locale et ancienne CI ne leur sont pas attribuées.

La suite commune locale passe 987 tests dans 161 fichiers en 267,78 secondes, types, ESLint et Oxlint. Elle inclut les trente cas d’annuaire, les dix-sept cas de fiche Client et les quatre courses de paiements manuels. Le premier contrôle Oxlint du test de paiements refusait le nom local réservé `module` ; la variable a été renommée, sans retirer la règle.

Les schémas SQLite et PostgreSQL sont validés ; le build de 75 pages réussit. La découverte de 188 E2E dans 41 fichiers n’est pas une exécution navigateur.

## CI du candidat 653cddc

Les [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37799746983) et de [PR](https://github.com/lacombechristophe/freelio/actions/runs/37799765287) réussissent : 987 tests SQLite, 986 PostgreSQL et une exclusion native SQLite, 167 E2E et 19 exclusions historiques, neuf contrôles Linux, audits production/complet à zéro. Les trente cas d’annuaire et les six parcours CSV passent dans les deux exécutions. Les [métadonnées de l’artefact PostgreSQL](evidence/20261008-client-directory/ci-653cddc.json) relient la fusion de test à main et au candidat ; elles conservent aussi les 17 cas de fiche et les quatre courses de paiements réussis. Ces résultats précèdent les nouveaux correctifs Suivi client et contexte d’autorisation.

## Limites

La correction couvre les deux lecteurs et l’export de cet annuaire. Elle ne qualifie pas les autres tableaux de bord ou métriques métier, les propriétés CRM personnalisées, toute l’isolation CRM ni la charge des tris calculés sur un grand portefeuille. Les historiques Client et autres propositions visibles restent distincts.
