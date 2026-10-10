# Preuves du lockfile candidat — 6 octobre 2026

Référence testée : `48f86431effee45fc491038212ab293a8bfcd38f`. SHA-256 du lockfile : `947bc5cc6e96a7bb8ece0a844db177ec9f5684a2902f15c3d75015623caadcd9`.

- `dependencies.json` : inventaire reproductible de 863 entrées ; 40 éléments à examiner manuellement, aucune licence inconnue. Les notices système/Chromium/assets et le choix de licence du code propre restent distincts.
- `audit-production.json` : zéro alerte npm connue au contrôle.
- `audit-complete.json` : cinq alertes hautes de développement, chaîne braces → micromatch → fast-glob → @next/eslint-plugin-next → eslint-config-next. Le contrôle reste bloquant sans exception.

Les correctifs ciblés portent sharp à 0.35.5, fast-copy à 4.1.2 et source-map-js à 1.2.2. Le CLI shadcn inutilisé est retiré ; les composants existants restent présents. Aucun changement majeur ni contournement de l’audit.

[CI push](https://github.com/lacombechristophe/freelio/actions/runs/37509658360) et [CI PR](https://github.com/lacombechristophe/freelio/actions/runs/37509666102) : typage/lint/build, 672 tests SQLite, 671 PostgreSQL et un test natif SQLite exclu de PostgreSQL, 117 parcours navigateur réussis et 19 exclusions préexistantes. Linux : neuf contrôles, 54 migrations, PDF/worker, archive de contrat synthétique READY avec rejeu inchangé, UID 1000. Le seul contrôle échoué sur les deux runs est l’audit complet. Ces preuves ne qualifient pas le nouveau lot finalité ni les changements ultérieurs.

Image Linux du run push : `sha256:73dd7acf1a5ad71d20a8e870f55fca2d51846ece3d2bdfbfb4bb6a987b4e2f13`. Les artefacts exacts ont été téléchargés et leur référence vérifiée ; aucun cookie, secret de test ou contenu de trace navigateur n’est publié dans ce dossier.

Précision sur checkout PR : le push teste directement `48f86431effee45fc491038212ab293a8bfcd38f`. Le run PR teste le commit de fusion synthétique `e7e0a5df345db2dc12e584098cba1c185dbd016b` ; son arbre Git `60ead7d29b95b7b22be71eeef122be7c6be3b39d` est identique à celui de la tête de branche, vérifié via les objets GitHub. La propriété headSha du run ne remplace pas le fichier tested-commit de son artefact. Cette distinction s’applique aux preuves des PR suivantes.
