# Qualification du candidat Freelio

État du 13 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Main, preview de branche et production sont des références distinctes.

## Candidat courant

`a055d65699f636e3676676302f0381678442d081` contient les parcours Temps et Organisation, leur facturation et les contrôles des aperçus documentaires. Les CI [branche](https://github.com/lacombechristophe/freelio/actions/runs/38321815498) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38321819239) réussissent tous leurs jobs. Les [rapports détaillés](evidence/20261013-candidate/ci-a055d65.json) conservent les résultats et le merge réellement testé. Les commits de documentation suivants ne changent pas le code hors `docs/`.

| Contrôle | Résultat disponible |
| --- | --- |
| Local : types, ESLint, Oxlint, build | Réussis |
| Local SQLite avec couverture | 2 009 tests / 206 fichiers réussis |
| PostgreSQL courant (deux artefacts contrôlés) | 2 008 réussis et une exclusion native SQLite ; 36 cas de libération et 29 cas PDF réussis |
| Image Linux du candidat courant | Neuf contrôles réussis dans les deux CI |
| Navigateur compilé | 361 réussis, 19 exclusions historiques dans chaque CI ; 14 nouveaux parcours Finance/PDF et six parcours d'imputation réussis |
| Audits de dépendances | Production et complet : zéro vulnérabilité dans chaque CI |
| Preview du candidat courant | 49 pages/onglets sur ordinateur et 49 sur mobile, zéro erreur JavaScript, retry ou exclusion |

La [recette hébergée](evidence/20261013-candidate/hosted-a055d65.json) contrôle `dpl_21jSLK1m3rDDGPhq7FaU1fvjobGN`. L'[identité du code](evidence/20261013-candidate/source-a055d65.json) compare 1 018 entrées Git hors `docs/` avec le merge PR réellement testé. La [migration de l'index](evidence/20261013-time-invoice-release/preview-index-upgrade.json) porte uniquement sur la base fictive dédiée : données métier identiques, compte lecteur sans CREATE ni écriture métier. Cette preview contient zéro temps et zéro tâche ; la conservation d'un ancien rattachement non vide est vérifiée séparément par la recette SQLite.

## Échecs précédents conservés

Les deux CI de `1586c1b` sont **annulées au plafond de 35 minutes** : [branche](https://github.com/lacombechristophe/freelio/actions/runs/38317716890), [PR](https://github.com/lacombechristophe/freelio/actions/runs/38317721467). SQLite : 1 944 réussis. PostgreSQL : 1 943 réussis et une exclusion native SQLite. Neuf contrôles Linux et deux audits sans vulnérabilité passent dans chaque run. La suite navigateur reste incomplète, avec quatre échecs desktop de facturation et un timeout d'automatisation.

Les [traces et corrections de sélecteurs](evidence/20261013-browser-navigation/README.md) expliquent ces échecs : l'attente de navigation acceptait la page initiale des temps non facturés ; une carte de calendrier était sélectionnée à la place de la carte contenant l'action de tâche. Toutes les assertions métier restent actives. Aucun timeout, audit ou seuil n'est assoupli.

La preview de `1586c1b`, `dpl_5p26BocxT54MANumDFUPCHXB2xLF`, réussit 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ou exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. Son résultat ne couvre pas les mutations des nouveaux lots. L'identité du code hors `docs/` est comparée au merge réellement testé par la CI PR.

## Correctifs récents

| Invariant | Preuves et périmètre |
| --- | --- |
| Une tâche ne produit qu'un temps ; tâche, budget et temps restent atomiques | [Organisation](evidence/20261012-task-time-imputation/README.md) : 34 cas SQL, six E2E. Association historique jamais déduite d'un titre. |
| Comptabilité peut facturer un temps accessible sans droit général Opérations | [Rattachement au nouveau brouillon](evidence/20261013-time-billing-accounting/README.md) : autorisation limitée au seul `invoiceId`, 30 cas SQL. |
| Facturer les secondes exactes, avec le même arrondi dans l'aperçu et la facture | [Calcul](evidence/20261013-time-invoice-rounding/README.md) : deux minutes à 100 €/h donnent 3,33 € regroupées ou 3,34 € détaillées. Nouvelles quantités documentaires à six décimales ; archives anciennes conservées. |
| Refuser une préparation devenue périmée | [Snapshot transactionnel](evidence/20261013-time-invoice-snapshot/README.md) : 17 cas SQL, recontrôle Serializable, aucun nouveau brouillon ni rattachement après refus. |
| Supprimer un brouillon accessible et libérer uniquement ses temps | [Libération](evidence/20261013-time-invoice-release/README.md) : 36 cas SQL, suppression, libération et audit atomiques. Documents émis protégés ; index additif, aucune réparation automatique des associations. |
| Un client étranger rend le document introuvable aussi par URL PDF | [Aperçus et téléchargements](evidence/20261013-document-preview-scope/README.md) : 29 cas SQL et deux E2E, refus avant rendu ou archive. |

Les accords visibles sont conservés dans leurs contrats. Les boutons, couleurs et dispositions ne sont pas redessinés par ces lots. Les preuves antérieures de [Dépenses](evidence/20261012-expense-project-selector/README.md), [écritures Temps](evidence/20261012-time-entry-integrity/README.md), [historique Temps](evidence/20261012-time-directory/README.md) et [Chantiers](evidence/20261012-project-directory/README.md) restent datées.

## Portée des preuves

Les suites SQL simulent l'authentification et le cache Next selon leurs fichiers ; elles utilisent les vraies actions, transactions et contraintes. Les suites fournisseurs décrivent leurs simulations HTTP. Les E2E compilés, les sondes hébergées et les tests SQL n'ont pas le même périmètre.

Les 19 exclusions historiques du navigateur correspondent à des mutations exécutées une fois sur bureau, une matrice de largeurs et des contrôles propres à une surface. Elles ne prouvent pas les mutations omises sur mobile. Aucun test des nouveaux lots Temps/Chantiers n'est retiré pour obtenir une CI verte. La [carte des preuves](carte-des-preuves.md) relie les risques aux suites.

## À terminer avant une affirmation plus large

- Relier toute nouvelle modification fonctionnelle à sa propre CI et sa propre recette ; les preuves ci-dessus qualifient a055d65, pas une évolution future.
- Examiner les sélecteurs et chaînes métier restants du [plan](plan-completude-fonctionnelle-20261002.md), sans confondre liste récente volontairement bornée et portefeuille complet.
- Deux diagnostics Chantiers restent ouverts : [client absent au-delà de 1 000 choix](contrat-chantier-choix-client.md) et [compteur global de modèle](contrat-modeles-chantier-compteur.md). Les propositions visibles attendent l'accord du propriétaire ; leur [reproducteur SQL](evidence/20261013-project-choices/reproducer.test.ts.txt) et leurs [observations](evidence/20261013-project-choices/before.json) sont conservés.
- Qualifier stockage persistant, comptes fournisseurs, délivrabilité, charge et reprise après arrêt brutal avant usage commercial. Le budget actuel reste de 0 €.

L'[historique de qualification](historique-qualification-candidat-20261010.md) conserve les références antérieures et leurs échecs. Les [preuves du socle](execution-cto-20261001.md) et la [recette hébergée sans stockage](qualification-demo-sans-stockage-20261010.md) restent datées. Aucun compteur de tests, rendu de démo ou ancien déploiement ne certifie tout le logiciel.
