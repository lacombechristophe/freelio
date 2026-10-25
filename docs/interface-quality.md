# Vérification de l’interface

La [PR #15](https://github.com/lacombechristophe/freelio/pull/15) corrige les ruptures de navigation de la démonstration et les états des composants partagés. Ses contrôles GitHub identifient le commit testé. Les captures de travail et les bases fictives restent hors du dépôt.

## Contrats à conserver

Une lecture peut exiger un droit d’administration sans modifier de données. `withReadAuth` conserve ce droit et indique une intention de lecture ; le client Prisma refuse les mutations dans ce contexte. Il ne faut pas remplacer `company.manage` ou `migration.manage` par un droit plus faible pour rendre un écran consultable. Les exceptions de lecture SQL des campagnes et récurrences restent limitées à leur requête et domaine.

La démo publique interdit les écritures côté serveur. Les liens vers une création ou une édition présentent une explication HTML ; les API interdites gardent leur refus HTTP 403. Les commandes indisponibles sur les documents restent désactivées. Dans le profil privé, une navigation utilise un vrai lien, pour conserver son rôle et le comportement du navigateur.

La recherche globale conserve uniquement le résultat de la requête actuelle, y compris après une erreur ou un effacement. Les refus des formulaires Client, Chantier et Dépense restent visibles dans le formulaire avec la saisie conservée. Le clavier doit atteindre les commandes et retrouver le déclencheur après fermeture d’un dialogue.

L’éditeur d’e-mail simple accepte la mise en forme qu’il sait représenter. Un ancien HTML plus riche reste en mode avancé ; le montage et le changement de mode ne déclenchent ni conversion destructive ni sauvegarde. Un brouillon programmé doit aussi figer le `contenteditable`, indépendamment du `fieldset`.

## Tests de régression

| Comportement | Recette |
| --- | --- |
| Lectures sans initialisation et droits d’administration conservés | `tests/unit/public-demo-pages.integration.test.ts`, `auth-context.integration.test.ts` |
| Refus serveur et explication de lecture seule | `tests/unit/demo-navigation.test.ts`, `tests/hosted/readonly-demo.spec.ts` |
| Navigation compacte, évitement et retour du focus | `tests/e2e/shell-accessibility.spec.ts`, `global-search-state.spec.ts` |
| Réponses de recherche inversées et erreur récupérable | `tests/e2e/global-search-state.spec.ts` |
| Refus de formulaire persistant | `tests/e2e/form-error-feedback.spec.ts` |
| Thème clair, sombre, système et CSP | `tests/e2e/theme-preferences.spec.ts`, `visual-edge-cases.spec.ts` |
| Préférence de mouvement et défilement du Pipeline | `tests/e2e/motion-preferences.spec.ts` |
| Vocabulaire Marketing et destinations des raccourcis | `tests/e2e/marketing-rule-language.spec.ts`, `tests/unit/dashboard-navigation.test.ts` |
| Rédaction simple et compatibilité HTML | `tests/e2e/communications-simple-editor.spec.ts` et suites `communications-*` |
| Logo indisponible, graphèmes, fenêtre courte et contrastes ciblés | `tests/e2e/visual-edge-cases.spec.ts`, `tests/unit/initials.test.ts` |
| Ajout fictif idempotent et relations cohérentes | `tests/unit/demo-stories.integration.test.ts` |

Utiliser une base de recette isolée et préparée : les suites SQL et E2E créent leurs propres données. Les [instructions de développement](../README.md#vérifications-et-preuves) décrivent les commandes générales. L’audit étendu du dashboard utilise les fixtures de `seed-ui-redesign.mjs` et `E2E_FULL_UI_AUDIT=true` ; il parcourt aussi les conteneurs défilants. Une route dynamique absente du jeu de données est signalée dans le rapport, sans être comptée comme vérifiée.

Pour une instance HTTPS en lecture seule, fournir `PLAYWRIGHT_BASE_URL`, `HOSTED_DEMO_EMAIL` et `HOSTED_DEMO_PASSWORD` dans l’environnement, puis exécuter :

```powershell
npx --no-install playwright test --config=playwright.hosted.config.ts
```

Cette recette interdit les requêtes du navigateur vers une autre origine, vérifie les titres et onglets attendus, recherche les écrans d’erreur même dans une réponse HTTP 200, puis contrôle les PDF et la déconnexion. Son résumé est conservé même en cas d’échec. Les traces et captures d’authentification sont désactivées. L’URL d’authentification de l’instance doit correspondre à son origine de recette ; autoriser silencieusement une redirection vers une autre version invaliderait le contrôle.

## Portée et limites

Le contrôle automatisé des pages inspecte un échantillon de données et d’états. Un résultat sans constat ne constitue ni une certification WCAG ni une validation de chaque modale, thème, combinaison de droits et contenu long. Le zoom réel à 200/400 %, Safari iPhone et Chrome Android physiques restent à vérifier ; une taille de viewport ne remplace pas ces essais.

Les trois dossiers fictifs et leur visite guidée nécessitent l’enrichissement additif décrit dans le [guide de démonstration](demo-local.md). Une prévisualisation ne vaut pas application sur la base hébergée. Aucun fournisseur, migration ou nouveau paquet n’est nécessaire pour ces corrections.
