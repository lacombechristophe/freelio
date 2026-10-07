# Mise à jour de sécurité Next.js — 8 octobre 2026

Le candidat utilisait Next.js et @next/env 16.3.6. Le contrôle actuel du lockfile signale six paquets hauts : les cinq paquets de la chaîne braces déjà suivie et Next.js. L’audit avec omit=dev signale désormais un paquet haut. Le zéro production relevé au début de la CI 6cc3d8a reste un résultat daté, et ne qualifie pas les avis disponibles ensuite.

Les six avis Next ont une première version corrigée **16.3.8**. La proposition automatique npm vers 16.4.0 n’est donc pas nécessaire pour les résoudre. Le changement verrouille Next.js, @next/env et les huit binaires SWC associés à 16.3.8 ; aucune autre version de paquet n’est modifiée. Le framework, l’interface et la configuration de sécurité ne changent pas.

Sources vérifiées : [SSRF Image Optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4), [cache Draft Mode](https://github.com/advisories/GHSA-3w37-wq28-93x7), [cache SSG/ISR](https://github.com/advisories/GHSA-4jqv-mc3x-m676), [endpoint MCP de développement](https://github.com/advisories/GHSA-39w2-rjm5-chcv), [routes d’image metadata](https://github.com/advisories/GHSA-f87g-xv8r-7p7x), [substitution de contenu SSG/ISR](https://github.com/advisories/GHSA-mcj8-r9mp-w47p). Ces avis décrivent des conditions différentes ; aucune exploitation dans Freelio n’est revendiquée reproduite par cette qualification de dépendance.

## Contrôles

Les audits du lockfile et de l’installation physique de recette retournent tous deux zéro vulnérabilité avec `omit=dev`, et cinq paquets hauts dans l’audit complet. Les [métadonnées reproductibles](evidence/20261008-next-studios/README.md) conservent l’empreinte du lockfile, les paquets concernés et l’inventaire des licences. L’installation de recette utilise `npm ci --ignore-scripts`, puis la génération explicite du client Prisma, dans une copie fictive externe après vérification que node_modules est un dossier physique ; aucun .env ou node_modules de l’instance originale n’est modifié.

Types/lint réussissent ; suite SQLite complète : 809 tests dans 150 fichiers en 160,41 secondes. La dernière vérification ciblée du panneau de reprise passe aussi. Le build webpack compile en 51 secondes, termine le typage en 30,6 secondes et génère 74 pages. Le schéma PostgreSQL est validé sans connexion ; 160 E2E dans 36 fichiers sont découverts, sans exécution locale revendiquée. La CI du nouveau candidat doit confirmer PostgreSQL, Linux et navigateur.

Les CI du candidat de reprise 1598302 sont lancées avant cette correction. Le contrôle production désormais rouge interrompt son job navigateur avant la préparation de SQLite. Ses résultats PostgreSQL/Linux se conservent séparément ; une découverte de tests ne remplace pas les E2E ainsi non exécutés. Le candidat corrigé devra qualifier aussi la reprise et les listes approuvées.

L’avis [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reste sans version corrigée annoncée ; npm propose un retour à ESLint Next 14 qui ne constitue pas une qualification pour le framework installé. Le contrôle complet reste bloquant, sans retrait de règle, fork fictivement patché ni réduction de sévérité. Main et la démo publique restent à une référence différente ; cette mise à jour n’est pas présentée comme déployée.
