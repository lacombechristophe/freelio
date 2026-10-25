# Une seule exécution SQL complète en CI

La CI PR de dfead51 imprime 339 E2E réussis, deux échecs d'assertion et 19 exclusions, puis est interrompue au plafond de 35 minutes. Le même plafond avait déjà interrompu la PR de 6e255a4. Ces runs ne sont pas présentés comme réussis.

Le workflow exécutait tous les tests SQL dans `verify`, puis une seconde fois avec couverture. Il exécute maintenant préparation, types, deux lints, toute la suite avec couverture et build, avant Chromium. Les mêmes 1 885 tests / 200 fichiers passent dans la [vérification locale](local.json). La configuration de couverture, les deux audits, les timeouts et les E2E restent inchangés. Aucun test n'est sélectionné, exclu ou relancé pour gagner du temps.

Le code applicatif n'est pas modifié par ce lot. Les [nouveaux runs de 2f338f4](../20261012-task-time-imputation/ci-2f338f4.json) exécutent cette séquence et publient leurs artefacts : le job Qualité/E2E termine en environ 25 et 22 minutes, sous le plafond conservé de 35 minutes. Les deux runs échouent sur les assertions Organisation décrites dans leur dossier de preuves ; le changement CI corrige la répétition de suite, pas ces assertions.
