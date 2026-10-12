# Qualification du candidat Freelio

État du 12 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Main, preview de branche et production sont des références distinctes.

## Candidat de référence

`dfead511e2404f15e29446d35e6f5b426d2a6204` inclut les sélecteurs Dépenses, les écritures et lecteurs Temps, puis la liste Chantiers complète. Ses CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38304130313) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38304136907) passent PostgreSQL et Linux, mais échouent sur deux assertions navigateur ambiguës. La branche termine en échec ; la PR imprime les résultats puis est interrompue au plafond de 35 minutes. Ce candidat n'est pas qualifié par une CI verte. Les [résultats détaillés](evidence/20261012-project-directory/ci-dfead51.json) restent conservés.

| Contrôle | Résultat disponible |
| --- | --- |
| Local : types, ESLint, Oxlint, build | Réussis |
| Local SQLite | 1 851 tests / 199 fichiers |
| CI PostgreSQL et image Linux | 1 850 tests PostgreSQL réussis, une exclusion native SQLite ; neuf contrôles Linux réussis |
| CI E2E | 339 réussis, deux échecs et 19 exclusions dans chaque run ; la PR est ensuite interrompue |
| CI audits production et complet | Deux résultats sans vulnérabilité dans chaque run ; le run PR reste annulé |
| Preview du même commit | 49 pages/onglets sur ordinateur et 49 sur mobile ; zéro erreur JavaScript, aucun retry ni exclusion |

La preview `dpl_2vyKqAC91fYcqDRsXhJbem79fR6w` est contrôlée avant/après ; les empreintes du harnais correspondent au commit. Elle utilise un compte fictif Owner en lecture seule, PostgreSQL et Upstash, sans stockage persistant. Elle qualifie lecture, rendu et restrictions, pas les envois métier réels.

Preuves ciblées : [Dépenses](evidence/20261012-expense-project-selector/README.md), [écritures Temps](evidence/20261012-time-entry-integrity/README.md), [historique et export Temps](evidence/20261012-time-directory/README.md), [Chantiers](evidence/20261012-project-directory/README.md). Les deux échecs d'édition navigateur du candidat `bcb7577` restent documentés ; son PostgreSQL et son image réussis ne rendaient pas ses CI vertes.

## Nouveaux correctifs à qualifier

`951d90b` rend l'imputation d'une tâche atomique, bornée aux droits Opérations et aux références accessibles. Une association unique et une date d'imputation empêchent les répétitions. Les anciens temps ne sont pas rapprochés par titre/date. Le [dossier de preuves](evidence/20261012-task-time-imputation/README.md) conserve diagnostic, tests et migration SQLite.

Localement : 1 885 tests SQLite / 200 fichiers, types, deux lints et build réussis ; 34 cas ciblés d'imputation, six E2E définis. Ces E2E sont chargés, pas exécutés localement. La migration et la contention PostgreSQL, le navigateur compilé et la preview doivent encore qualifier ce nouveau code sur son commit. Le test Chantiers cible maintenant l'alerte de la liste ; la CI exécute toute la suite SQL une seule fois avec couverture, au lieu de deux exécutions complètes. Aucun test, seuil de couverture, audit ou timeout n'est supprimé ou assoupli. La [preuve du changement CI](evidence/20261012-ci-duration/README.md) distingue la couverture locale de la durée à vérifier sur GitHub. Le [refus de facturation des temps périmés](contrat-facturation-temps-perimes.md) reste proposé et non implémenté.

## Portée des preuves

Les suites SQL simulent l'authentification et le cache Next selon leurs fichiers ; elles utilisent les vraies actions, transactions et contraintes. Les suites fournisseurs décrivent leurs simulations HTTP. Les E2E compilés, les sondes hébergées et les tests SQL n'ont pas le même périmètre.

Les 19 exclusions historiques du navigateur correspondent à des mutations exécutées une fois sur bureau, une matrice de largeurs et des contrôles propres à une surface. Elles ne prouvent pas les mutations omises sur mobile. Aucun test des nouveaux lots Temps/Chantiers n'est retiré pour obtenir une CI verte. La [carte des preuves](carte-des-preuves.md) relie les risques aux suites.

## À terminer avant une affirmation plus large

- Qualifier le correctif Organisation sur les deux CI et sa preview ; vérifier la migration additive uniquement dans la base fictive dédiée.
- Corriger la facturation des temps modifiés pendant la préparation, après l'accord sur son refus visible.
- Examiner les sélecteurs et chaînes métier restants du [plan](plan-completude-fonctionnelle-20261002.md), sans confondre liste récente volontairement bornée et portefeuille complet.
- Qualifier stockage persistant, comptes fournisseurs, délivrabilité, charge et reprise après arrêt brutal avant usage commercial. Le budget actuel reste de 0 €.

L'[historique de qualification](historique-qualification-candidat-20261010.md) conserve les références antérieures et leurs échecs. Les [preuves du socle](execution-cto-20261001.md) et la [recette hébergée sans stockage](qualification-demo-sans-stockage-20261010.md) restent datées. Aucun compteur de tests, rendu de démo ou ancien déploiement ne certifie tout le logiciel.
