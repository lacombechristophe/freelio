# Recette du candidat du 14 octobre

`a01ce4c` est le code testé. L'[état de qualification](../../completude-recette-20261003.md) distingue le passage fonctionnel complet de la PR, l'échec Portail et l'interruption de la branche, puis le refus de téléversement des rapports.

- [CI](ci-a01ce4c.json) : métadonnées terminales GitHub et digests des six logs complets de jobs. Les JSON natifs non téléversés ne sont pas reconstitués.
- [Source](source-a01ce4c.json) : comparaison des entrées Git hors documentation avec le merge PR testé.
- [Preview](hosted-a01ce4c.json) : 49 visites par surface, harnais et alias vérifiés ; lecture seule fictive sans stockage persistant.
- [Séparation des surfaces](browser-project-split.json) : union exacte des 430 cas sélectionnés, sans serveur ni exécution métier.
- [Diagnostic immédiat](reporter-probe.json) : comparaison des reporters intégrés à partir de la configuration réelle ; deux assertions synthétiques, pas une reproduction du Portail.

Les deux derniers contrôles concernent la recette suivante. Ils ne prouvent pas son résultat CI et ne remplacent pas l'échec conservé. Les fixtures et comptes réels, la charge et la récupération distante restent hors de ces preuves.
