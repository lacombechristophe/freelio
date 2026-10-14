# Qualification du candidat Freelio

État du 14 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le code `a01ce4c533a2527d6c2ead8450d194804f5d735d` passe toute la recette fonctionnelle de la CI PR. Il n'est pas entièrement qualifié : la CI branche comporte un échec Portail, puis atteint le plafond de 45 minutes, et GitHub refuse les uploads de rapports dans les deux runs faute de stockage disponible.

| Contrôle | CI branche | CI PR |
| --- | --- | --- |
| Types, ESLint, Oxlint, couverture et build | Réussis | Réussis |
| SQLite | 2 360 cas / 222 fichiers réussis | 2 360 cas / 222 fichiers réussis |
| PostgreSQL | 2 359 réussis, une exclusion native SQLite | 2 359 réussis, une exclusion native SQLite |
| Image Linux et runtime | Neuf contrôles réussis | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité dans les deux audits | Zéro vulnérabilité dans les deux audits |
| Navigateur compilé | Incomplet : 372 réussis, un échec, 17 exclusions recensées sur 390 cas ; 40 non recensés | 411 réussis, 19 exclusions historiques, aucun échec ; 27,8 minutes |
| Rapports détaillés téléversés | Refusés : quota GitHub | Refusés : quota GitHub |

Les [résultats et digests des logs](evidence/20261014-candidate/ci-a01ce4c.json) distinguent ces états. Les runs [branche](https://github.com/lacombechristophe/freelio/actions/runs/38629552114) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38629561175) restent rouges. Le bilan n'est pas reconstruit comme une CI verte à partir des seuls tests réussis.

Les 59 nouveaux contrôles SQL Achat et les quatre parcours Achat ordinateur/mobile passent dans les deux runs. Les contrôles de Communications et de sérialisation SQLite passent aussi sur PostgreSQL réel. Aucun P1008 ou P2028 n'est relevé dans les logs de la recette navigateur de ce candidat ; cela ne prouve pas l'absence de contention sous charge.

La [preview exacte](evidence/20261014-candidate/hosted-a01ce4c.json) passe 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ni exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. L'[identité du code](evidence/20261014-candidate/source-a01ce4c.json) compare 1 071 entrées Git hors `docs/` au merge PR réellement testé `9bffef8b84d7c07ceb41add8dfba4bb5819d370b`. Harnais et alias ont été vérifiés après la visite. Cette consultation ne prouve pas les mutations ni les comptes fournisseurs.

## Corrections récentes

| Invariant | Correction et preuves |
| --- | --- |
| Un produit ou chantier ancien reste sélectionnable sans effacer le formulaire | [Choix Achat](evidence/20261014-purchase-choices/README.md) : recherche et pages de 25, choix séparément vérifié, identité stable des lignes, prix personnels conservés ; 35 cas SQL et deux E2E. |
| Une création d'achat refuse les références devenues invalides | [Création Achat](evidence/20261014-purchase-creation-integrity/README.md) : chantier/client/agence et produits actifs relus dans la transaction ; aucun brouillon, ligne ni audit après refus ; 24 cas SQL et deux E2E. |
| Les lectures interactives SQLite ne se bloquent pas entre actions | [Transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) : file par processus, budget maxWait conservé, appel expiré jamais exécuté, contexte de chaque demandeur conservé ; PostgreSQL et transactions par tableau inchangés. |
| Le compilateur enfant reçoit le budget du build | [Mémoire et image](evidence/20261014-build-memory/README.md) : transmission explicite au CLI TypeScript de Next ; préchargement inclus dans le builder Docker. |
| La recette fournisseur distingue chaque recherche | [Historiques fournisseur](evidence/20261014-supplier-history-recipe/README.md) : attentes métier identiques dans trois cas indépendants, sans modification du lecteur ni de son délai. |

Les intercalages SQL Achat prouvent la relecture après préparation du numéro. Ils ne constituent pas un stress concurrent sur plusieurs connexions. Les prix, libellés, lignes libres et changements légitimes restent conservés. Aucun fournisseur réel n'est appelé.

## Qualification à poursuivre

Le parcours Portail échoue sur la branche et passe sur la PR. Les logs de la branche ne contiennent pas son assertion détaillée : le reporter la diffère jusqu'à la fin de suite, interrompue à 45 minutes. La correction de recette utilise le reporter intégré qui imprime l'erreur immédiatement et sépare ordinateur/mobile sur deux runners avec leurs propres bases fictives. Le [contrôle de sélection](evidence/20261014-candidate/browser-project-split.json) retrouve exactement les mêmes 430 cas, 215 par surface. Le [contrôle du reporter](evidence/20261014-candidate/reporter-probe.json) vérifie l'ordre d'impression avec deux assertions synthétiques, sans serveur ni navigateur. Il ne reproduit pas le défaut Portail.

Le commit `20ee4e4` conserve les délais individuels de 240 secondes et du job de 45 minutes, les assertions, seuils de couverture et audits. L'indépendance effective des deux surfaces et le résultat Portail doivent être observés dans sa nouvelle CI. Cette modification de recette ne transforme pas les résultats antérieurs.

Deux opérations préparées attendent encore l'accord du propriétaire :

- Retirer 269 anciennes archives UI GitHub, sauvegardées localement et vérifiées par SHA-256, pour libérer le quota sans toucher aux runs, logs et preuves SQL/Linux. Aucune suppression distante n'a été exécutée.
- Corriger treize lectures de relations incohérentes dans la synthèse Opérations. La reproduction utilise des fixtures volontairement injectées ; elle ne prouve pas leur création par les formulaires. Ce lot comporte des refus visibles et reste distinct des créations Achat approuvées.

Le stockage durable, les comptes OAuth/transport réels, la délivrabilité, la charge, la reprise après arrêt brutal et la récupération distante restent à qualifier avant un usage commercial. Le budget courant est de 0 € et aucun abonnement R2 n'est engagé.

## Dernière référence entièrement qualifiée

`2b05e5f6d425542971285f13170fbcb44bb6f1bb` complète le Stock. Ses deux CI passent entièrement : 2 287 SQLite, 2 286 PostgreSQL avec une exclusion native SQLite, 407 parcours navigateur avec 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité par run. Sa lecture hébergée passe 49 visites par surface. Les [preuves CI](evidence/20261013-candidate/ci-2b05e5f.json), l'[identité](evidence/20261013-candidate/source-2b05e5f.json) et la [lecture hébergée](evidence/20261013-candidate/hosted-2b05e5f.json) restent datées ; elles ne qualifient pas les évolutions suivantes.

## Portée et historique

Les tests SQL utilisent les vraies actions et contraintes avec authentification/cache simulés selon leurs fichiers. Les suites fournisseurs indiquent leurs simulations HTTP. La couverture concerne six modules configurés, pas l'application entière. Les 19 exclusions historiques du navigateur restent explicites et ne prouvent pas les mutations omises sur mobile.

La [carte des preuves](carte-des-preuves.md) relie risques, tests et limites. Les diagnostics [typage](evidence/20261014-ci-typecheck/README.md), [compilateur](evidence/20261014-build-memory/README.md), [Communications](evidence/20261014-communication-dashboard/README.md) et [transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) conservent les échecs précédents. Les [références antérieures](historique-qualification-candidat-20261010.md), le [journal](journal-recettes-completude-20261003.md) et les rapports versionnés sont conservés. Aucun compteur de tests ou ancien déploiement ne certifie tout le logiciel.

| Référence antérieure | Rapports conservés |
| --- | --- |
| Choix Produit Opérations | [bfe5d6b](evidence/20261013-candidate/ci-bfe5d6b.json) ; [échec ca6f6fb](evidence/20261013-candidate/ci-ca6f6fb.json) |
| Choix Client Opérations | [d36a38d](evidence/20261013-candidate/ci-d36a38d.json) |
| Prospects entrants | [ffee948](evidence/20261013-candidate/ci-ffee948.json) |
| Portail, Modèles et Affaires | [8d7b234](evidence/20261013-candidate/ci-8d7b234.json) |
| Choix Client Chantiers et facturation des temps | [19502a6](evidence/20261013-candidate/ci-19502a6.json), [12d3aa7](evidence/20261013-candidate/ci-12d3aa7.json) ; [échec 06d0d7c](evidence/20261013-browser-navigation/ci-06d0d7c.json) |
