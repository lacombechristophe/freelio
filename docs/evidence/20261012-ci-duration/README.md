# Une seule exécution SQL complète en CI

La CI PR de dfead51 imprime 339 E2E réussis, deux échecs d'assertion et 19 exclusions, puis est interrompue au plafond de 35 minutes. Le même plafond avait déjà interrompu la PR de 6e255a4. Ces runs ne sont pas présentés comme réussis.

Le workflow exécutait tous les tests SQL dans `verify`, puis une seconde fois avec couverture. Il exécute maintenant préparation, types, deux lints, toute la suite avec couverture et build, avant Chromium. Les mêmes 1 885 tests / 200 fichiers passent dans la [vérification locale](local.json). La configuration de couverture, les deux audits, les timeouts et les E2E restent inchangés. Aucun test n'est sélectionné, exclu ou relancé pour gagner du temps.

Le code applicatif n'est pas modifié par ce lot. La syntaxe du workflow, la durée réelle et les uploads doivent être contrôlés sur les nouveaux runs ; la commande locale seule ne les qualifie pas.
