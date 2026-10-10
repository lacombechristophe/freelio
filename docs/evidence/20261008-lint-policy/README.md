# Dépendances après séparation des règles Next

Le lockfile candidat porte l’empreinte SHA-256 `01ccfdac6f6eca66691c55baf9a2a3a2bcd150fd551c39727b1d08ff597eb1f2`. [L’inventaire](dependencies.json), généré par `node scripts/inventory-dependencies.mjs`, contient 864 paquets, zéro licence inconnue dans les métadonnées et 40 entrées à examiner manuellement. La licence de la règle conservée hors npm figure dans [tooling/lint](../../../tooling/lint/README.md).

Les [audits résumés](audits.json) du lockfile et d’une installation physique neuve donnent zéro vulnérabilité, avec et sans les dépendances de développement. Reproduction : `npm ci` dans une copie isolée, puis `npm audit --json` et `npm audit --omit=dev --json`. Les avis peuvent évoluer après ce relevé ; ce résultat ne remplace pas la CI du commit livré.

Les versions des dépendances de production présentes dans l’ancien lockfile sont inchangées. ESLint Next est retiré avec la chaîne vulnérable ; les plugins ESLint conservés reprennent leurs versions installées, et Oxlint est fixé à 1.87.0. [La politique de lint](../../../tooling/lint/README.md) documente les règles, les différences observées et l’entretien de la règle officielle conservée. Les preuves Next/studios précédentes restent dans leur dossier historique et ne sont pas écrasées.
