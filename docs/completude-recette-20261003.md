# Qualification du candidat Freelio

État du 15 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le dernier résultat complet disponible concerne `1fcb8a5a06a71a9a378e53e0a6b3b57ed5cf5571`. Les deux surfaces terminent désormais avant le plafond du job. Le candidat reste non qualifié : les deux CI mobiles signalent deux échecs, le registre ECR refuse Linux dans la branche et le quota GitHub empêche les uploads de rapports.

| Contrôle | CI branche | CI PR |
| --- | --- | --- |
| Types, ESLint, Oxlint, couverture et build | Réussis | Réussis |
| SQLite | 2 360 cas / 222 fichiers réussis dans chacun des deux jobs UI | 2 360 cas / 222 fichiers réussis dans chacun des deux jobs UI |
| PostgreSQL | 2 359 réussis, une exclusion native SQLite | 2 359 réussis, une exclusion native SQLite |
| Image Linux et runtime | HTTP 429 avant construction, conservé après relance du seul job Linux | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité dans les deux audits de chaque job UI | Zéro vulnérabilité dans les deux audits de chaque job UI |
| Navigateur compilé | Ordinateur : 214 réussis / une exclusion ; mobile : 195 réussis / deux échecs / 18 exclusions | Ordinateur : 214 réussis / une exclusion ; mobile : 195 réussis / deux échecs / 18 exclusions |
| Rapports détaillés téléversés | Refusés : quota GitHub | Refusés : quota GitHub |

Les [résultats et digests des logs](evidence/20261015-browser-recipes/ci-1fcb8a5.json) distinguent ces états. Les runs [branche](https://github.com/lacombechristophe/freelio/actions/runs/38637975566) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38637983101) restent rouges. Les trois jobs non relancés de la tentative 2 sont des résultats reportés, pas de nouveaux passages. Le bilan n'est pas reconstruit comme une CI verte à partir des seuls tests réussis.

Les 59 nouveaux contrôles SQL Achat et les quatre parcours Achat ordinateur/mobile passent dans les deux runs. Les contrôles de Communications et de sérialisation SQLite passent aussi sur PostgreSQL réel. Le Portail passe dans les deux jobs ordinateur ; le premier échec de a01ce4c reste conservé sans cause attribuée. Ces passages ne constituent pas une mesure de charge.

La [preview exacte](evidence/20261015-browser-recipes/hosted-1fcb8a5.json) passe 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ni exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. L'[identité du code](evidence/20261015-browser-recipes/source-1fcb8a5.json) compare 1 071 entrées Git hors `docs/` au merge PR réellement testé `09cd36172cfb04cec8e1570b5f889c68ac826f43`. Harnais et alias ont été vérifiés après la visite. Cette consultation ne prouve pas les mutations ni les comptes fournisseurs.

## Corrections récentes

| Invariant | Correction et preuves |
| --- | --- |
| Un produit ou chantier ancien reste sélectionnable sans effacer le formulaire | [Choix Achat](evidence/20261014-purchase-choices/README.md) : recherche et pages de 25, choix séparément vérifié, identité stable des lignes, prix personnels conservés ; 35 cas SQL et deux E2E. |
| Une création d'achat refuse les références devenues invalides | [Création Achat](evidence/20261014-purchase-creation-integrity/README.md) : chantier/client/agence et produits actifs relus dans la transaction ; aucun brouillon, ligne ni audit après refus ; 24 cas SQL et deux E2E. |
| Les lectures interactives SQLite ne se bloquent pas entre actions | [Transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) : file par processus, budget maxWait conservé, appel expiré jamais exécuté, contexte de chaque demandeur conservé ; PostgreSQL et transactions par tableau inchangés. |
| Le compilateur enfant reçoit le budget du build | [Mémoire et image](evidence/20261014-build-memory/README.md) : transmission explicite au CLI TypeScript de Next ; préchargement inclus dans le builder Docker. |
| La recette fournisseur distingue chaque recherche | [Historiques fournisseur](evidence/20261014-supplier-history-recipe/README.md) : attentes métier identiques dans trois cas indépendants, sans modification du lecteur ni de son délai. |
| Une facture historique sans archive ne charge pas une erreur JSON comme PDF | [Lot approuvé](contrat-factures-historiques-apercu.md) et [preuves locales](evidence/20261015-historical-invoice-preview/README.md) : indisponibilité explicite, accès PDF désactivés, aucun rendu régénéré ; CI du nouveau code encore requise. |

Les intercalages SQL Achat prouvent la relecture après préparation du numéro. Ils ne constituent pas un stress concurrent sur plusieurs connexions. Les prix, libellés, lignes libres et changements légitimes restent conservés. Aucun fournisseur réel n'est appelé.

## Qualification à poursuivre

Les deux échecs mobiles de 1fcb8a5 sont désormais diagnostiqués. Un compteur Fournisseur était recherché dans toute la fenêtre Produit, où le choix Produit parent affiche aussi « 1 résultat ». L'audit général choisissait la première facture découverte et dépendait des documents créés sur ordinateur ; la base mobile neuve proposait une facture SENT sans archive. `53d47f2` limite le compteur à son champ et réserve un brouillon fictif vérifié pour la route représentative. Tous les contrôles console/HTTP restent actifs et le rapport annonce le choix de sa fixture.

Le défaut produit de facture historique est traité séparément dans `c578bdf` : le nouveau test SSR échoue avant correction, puis les 39 contrôles ciblés passent avec types, lint et build local de 75 pages statiques. Deux nouveaux E2E vérifient le cas historique sans écriture ; le [contrôle de sélection](evidence/20261015-historical-invoice-preview/browser-selection.json) compte 432 cas, 216 par surface. La compilation locale ne prouve pas leur exécution.

`6a4cf3d` remplace les accès directs ECR des images Node et du service PostgreSQL par leurs [manifestes officiels identiques et épinglés](evidence/20261015-container-registries/README.md). Aucun moteur ni contrôle Linux n'est retiré. La disponibilité depuis les runners et les neuf contrôles restent à qualifier.

Les délais existants restent conservés : 240 secondes par défaut, 15 minutes pour l'audit UI et 45 minutes par job. Les assertions, seuils de couverture et audits sont inchangés. La nouvelle CI doit confirmer ces corrections ; les [résultats antérieurs de a01ce4c](evidence/20261014-candidate/ci-a01ce4c.json) et les [contrôles du reporter](evidence/20261014-candidate/reporter-probe.json) restent datés.

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
