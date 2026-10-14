# Build Next et conservation des preuves CI

Les [deux CI de 6ca0981](ci-6ca0981.json) passent désormais les 2 346 cas SQLite, types et lint. Webpack compile l'application, puis le worker TypeScript de Next atteint son plafond d'environ 2 Go. Le build échoue avant les parcours navigateur. Les neuf contrôles Linux s'exécutent avec succès dans les deux runs ; PostgreSQL passe 2 345 cas sur la branche et une exclusion native SQLite. Le service PostgreSQL de la PR n'atteint pas les tests après refus de téléchargement ECR. Les jobs échouent aussi à conserver leurs artefacts, le quota GitHub étant atteint.

Le budget de 4 096 Mo est ajouté à la commande de build, comme au contrôle de types indépendant. Le worker TypeScript de Next 16.3.8 utilise `isolatedMemory: false` et reprend cette option depuis `process.execArgv`, selon le code installé. La vérification de types du build reste active. Le [build local complet](local-build.json) passe : compilation, TypeScript et 75 pages statiques. Aucun serveur local, installation ou envoi fournisseur n'est nécessaire pour ce contrôle. Le script de démarrage et la mémoire du serveur restent conservés.

La [preview exacte de 6ca0981](hosted-6ca0981.json) parcourt 49 pages/onglets par surface sans erreur JavaScript, retry ou exclusion, avec harnais et alias vérifiés. Cette consultation ne prouve pas les quatre parcours Achat avec mutation ; ceux-ci restent à exécuter dans les CI du nouveau candidat.

## Volume des artefacts

L'inventaire du 14 octobre compte 1 019 artefacts actifs, soit environ 27,3 Go. Les 269 anciens `ui-audit-reports` et `playwright-report` créés avant le 14 octobre UTC représentent presque tout ce volume ; les autres preuves occupent environ 13 Mo. Une archive locale complète avec comparaison des empreintes GitHub est préparée avant toute demande de suppression. Aucun artefact ni run n'est supprimé sans accord. La suppression d'un artefact est irréversible et la mise à jour du stockage peut prendre 6 à 12 heures, selon la [documentation GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Les prochaines CI conservent les rapports JSON pendant sept jours. En cas d'échec ou d'annulation, le rapport Playwright et les résultats complets, captures et traces compris, restent disponibles pendant sept jours. Les tests, captures locales, assertions et délais continuent à s'exécuter de la même manière. Cette réduction des téléchargements réussis ne constitue pas un assouplissement des contrôles. Le budget reste nul ; aucun quota payant n'est ouvert.

Les rapports détaillés PostgreSQL/Linux de 6ca0981 n'ont pas été téléversés. Leur absence est conservée explicitement : les résumés des logs et leurs empreintes ne sont pas présentés comme les JSON détaillés manquants. Le dernier candidat entièrement qualifié reste Stock 2b05e5f.
