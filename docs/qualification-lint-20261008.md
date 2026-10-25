# Qualification locale du lint et des derniers correctifs

Le candidat conserve Next 16.3.8 et les versions de production, puis retire `eslint-config-next@16.3.6` avec la chaîne `fast-glob → micromatch → braces`. Les mêmes versions des plugins ESLint sont déclarées directement. Oxlint 1.87.0 exécute 21 règles Next et une seule règle officielle est conservée sous MIT. La [politique](../tooling/lint/README.md) donne sources, exceptions, différences observées et entretien attendu.

`lint-policy.test.ts` exécute 41 cas : politique résolue pour TSX/TS/MJS, fautes de chacune des 21 règles natives, fichier de téléchargement valide, présence des deux moteurs dans la commande npm et cas de navigation relative/globale, URL absolue, portée locale et variable réaffectée. Les tests ne désactivent pas React Hooks ni la règle de pureté qui a refusé une première version du correctif de notifications.

## Résultats locaux

- Types, ESLint et Oxlint réussis.
- **875 tests SQLite / 153 fichiers**, en 151,47 secondes, tous réussis.
- Build webpack : compilation 25,9 secondes, types 12,3 secondes et 74 pages générées.
- Schéma PostgreSQL validé sans connexion ; 166 E2E / 38 fichiers découverts. Aucune exécution SQL PostgreSQL ou navigateur locale revendiquée.
- [Audits lockfile et installation](evidence/20261008-lint-policy/README.md) : zéro alerte avec et sans les dépendances de développement.
- Publication : 960 fichiers et 2 831 blobs historiques inspectés, aucun finding, un exemple fictif exclu. Liens locaux de documentation : 197 vérifiés, aucun manquant avant ce complément.

La recette utilise une copie physique et SQLite fictive, sans .env ni données existantes, fournisseurs, lancement de serveur ou contournement du refus antérieur. Le lockfile exact et les métadonnées de licences sont versionnés ; les logs privés restent hors dépôt.

## Échecs corrigés et limites

La première vérification de politique a dépassé cinq secondes lors du chargement à froid des plugins, mesuré à 20 secondes sur Windows. Ce chargement est désormais un hook de préparation borné à 30 secondes ; les assertions gardent leur délai de cinq secondes. Les 40 autres cas passaient déjà.

La suite complète suivante a refusé la préparation Banque après dix secondes : 857 tests passaient et les 18 cas Banque n’avaient pas été exécutés. Le commit **6d3160e** prépare les mêmes volumes via `createMany` plutôt que des insertions individuelles. Il ne change aucun délai de cette suite ni aucune assertion. La suite finale passe ses 875 cas. Les [contrats Banque](contrat-banque-listes-completes.md) et [dates](contrat-banque-dates-import.md) conservent leurs limites de charge et concurrence ; le [défaut d’hydratation](qualification-notifications-20261008.md) reste à qualifier dans le navigateur CI.

La CI du nouveau commit doit encore valider les deux moteurs sous Linux, les vraies requêtes PostgreSQL, l’image, les migrations et les parcours ordinateur/mobile. Ces résultats locaux ne sont pas présentés comme une fusion ou un déploiement.
