# Qualification du candidat Freelio

État du 15 octobre 2026. [PR #8](https://github.com/lacombechristophe/freelio/pull/8), branche `codex/functional-completeness-20261003`. Le candidat, main et la production sont des références distinctes.

## Résultat actuel

Le dernier résultat complet concerne `a39e5a5fff11d7b11ca0fbb8196a0273776e113d`. Les quatre jobs navigateur terminent avant leur plafond. Le candidat reste non qualifié : ses recettes signalent des échecs, et GitHub refuse encore les uploads après le nettoyage des anciennes archives. Linux passe désormais dans les deux workflows.

| Contrôle | CI branche | CI PR |
| --- | --- | --- |
| Types, ESLint, Oxlint, couverture et build | Réussis | Réussis |
| SQLite | 2 361 cas / 222 fichiers réussis dans chacun des deux jobs UI | 2 361 cas / 222 fichiers réussis dans chacun des deux jobs UI |
| PostgreSQL | 2 360 réussis, une exclusion native SQLite | 2 360 réussis, une exclusion native SQLite |
| Image Linux et runtime | Neuf contrôles réussis | Neuf contrôles réussis |
| Audits production et complet | Zéro vulnérabilité dans les deux audits de chaque job UI | Zéro vulnérabilité dans les deux audits de chaque job UI |
| Navigateur compilé | Ordinateur : 213 réussis / deux échecs / une exclusion ; mobile : 197 réussis / un échec / 18 exclusions | Ordinateur : 212 réussis / trois échecs / une exclusion ; mobile : 197 réussis / un échec / 18 exclusions |
| Rapports détaillés téléversés | Refusés : quota GitHub | Refusés : quota GitHub |

Les [résultats et digests des logs](evidence/20261015-candidate/ci-a39e5a5.json) distinguent ces états. Les runs [branche](https://github.com/lacombechristophe/freelio/actions/runs/38731137154) et [PR](https://github.com/lacombechristophe/freelio/actions/runs/38731141563) restent rouges. Les uploads refusés ne sont pas transformés en succès par les seuls tests réussis. Les [échecs précédents de 1fcb8a5](evidence/20261015-browser-recipes/ci-1fcb8a5.json) restent conservés.

Les 59 nouveaux contrôles SQL Achat et les quatre parcours Achat ordinateur/mobile passent dans les deux runs. Les contrôles de Communications et de sérialisation SQLite passent aussi sur PostgreSQL réel. Le Portail passe dans les deux jobs ordinateur ; le premier échec de a01ce4c reste conservé sans cause attribuée. Ces passages ne constituent pas une mesure de charge.

La [preview exacte](evidence/20261015-candidate/hosted-a39e5a5.json) passe 49 pages/onglets sur ordinateur et 49 sur mobile, sans erreur JavaScript, retry ni exclusion. Compte fictif Owner, lecture seule, PostgreSQL et Upstash, stockage persistant désactivé. L'[identité du code](evidence/20261015-candidate/source-a39e5a5.json) compare 1 072 entrées Git hors `docs/` au merge PR réellement testé `a6f399adcb535bf716d6761ab746563f5523874c`. Harnais et alias ont été vérifiés après la visite. Cette consultation ne prouve pas les mutations ni les comptes fournisseurs.

## Corrections récentes

| Invariant | Correction et preuves |
| --- | --- |
| Un produit ou chantier ancien reste sélectionnable sans effacer le formulaire | [Choix Achat](evidence/20261014-purchase-choices/README.md) : recherche et pages de 25, choix séparément vérifié, identité stable des lignes, prix personnels conservés ; 35 cas SQL et deux E2E. |
| Une création d'achat refuse les références devenues invalides | [Création Achat](evidence/20261014-purchase-creation-integrity/README.md) : chantier/client/agence et produits actifs relus dans la transaction ; aucun brouillon, ligne ni audit après refus ; 24 cas SQL et deux E2E. |
| Les lectures interactives SQLite ne se bloquent pas entre actions | [Transactions SQLite](evidence/20261014-sqlite-transaction-queue/README.md) : file par processus, budget maxWait conservé, appel expiré jamais exécuté, contexte de chaque demandeur conservé ; PostgreSQL et transactions par tableau inchangés. |
| Le compilateur enfant reçoit le budget du build | [Mémoire et image](evidence/20261014-build-memory/README.md) : transmission explicite au CLI TypeScript de Next ; préchargement inclus dans le builder Docker. |
| La recette fournisseur distingue chaque recherche | [Historiques fournisseur](evidence/20261014-supplier-history-recipe/README.md) : attentes métier identiques dans trois cas indépendants, sans modification du lecteur ni de son délai. |
| Une facture historique sans archive ne charge pas une erreur JSON comme PDF | [Lot approuvé](contrat-factures-historiques-apercu.md) et [preuves locales](evidence/20261015-historical-invoice-preview/README.md) : indisponibilité explicite, accès PDF désactivés, aucun rendu régénéré ; CI du nouveau code encore requise. |
| La synthèse Opérations n'inclut pas une référence étrangère dans ses listes ou compteurs | [Lot approuvé](contrat-operations-dashboard-relations.md) et [preuves locales](evidence/20261015-operations-dashboard/README.md) : treize exclusions initialement manquantes ; 37 cas dédiés et 121 avec les suites voisines passent sur SQLite. PostgreSQL et navigateur restent à qualifier sur ce nouveau code. |

Les intercalages SQL Achat prouvent la relecture après préparation du numéro. Ils ne constituent pas un stress concurrent sur plusieurs connexions. Les prix, libellés, lignes libres et changements légitimes restent conservés. Aucun fournisseur réel n'est appelé.

## Qualification à poursuivre

Les deux échecs mobiles de 1fcb8a5 sont désormais diagnostiqués. Un compteur Fournisseur était recherché dans toute la fenêtre Produit, où le choix Produit parent affiche aussi « 1 résultat ». L'audit général choisissait la première facture découverte et dépendait des documents créés sur ordinateur ; la base mobile neuve proposait une facture SENT sans archive. `53d47f2` limite le compteur à son champ et réserve un brouillon fictif vérifié pour la route représentative. Tous les contrôles console/HTTP restent actifs et le rapport annonce le choix de sa fixture.

Le défaut produit de facture historique est traité séparément dans `c578bdf` : le nouveau test SSR échoue avant correction, puis les 39 contrôles ciblés passent avec types, lint et build local de 75 pages statiques. Sur a39e5a5, ses deux E2E s'arrêtent avant l'interface : la facture bancaire réutilisée est devenue OVERDUE au lieu du SENT attendu. `eb90c50` fournit deux fixtures réservées, figées et sans archive, dont l'échéance est en 2100. Les assertions SENT, absence de PDF, refus 409 et absence de mutation restent conservées ; une fixture de recette ne constitue pas l'émission d'un document.

`6a4cf3d` remplace les accès directs ECR des images Node et du service PostgreSQL par leurs [manifestes officiels identiques et épinglés](evidence/20261015-container-registries/README.md). Aucun moteur ni contrôle Linux n'est retiré. Les neuf contrôles passent ensuite dans les deux CI de a39e5a5.

Le parcours Campagnes utilisait une fin fixe au 15 octobre 2026, déjà atteinte lors du run : l'activation est refusée par la règle existante. `94cb4c6` fournit une fenêtre relative au jour du test, avec les mêmes contrôles d'audience et d'inscription. Un troisième échec existe uniquement sur le desktop PR : le menu Supprimer ne s'ouvre pas avant l'expiration du test de libération des temps. Le harnais attend désormais l'hydratation et vérifie explicitement `aria-expanded` après chaque ouverture. Sans trace téléversée, la cause initiale n'est pas attribuée au produit ou au réseau ; le résultat de cette correction de recette reste à confirmer.

`625d66b` applique la protection Opérations approuvée. Ses [preuves locales](evidence/20261015-operations-dashboard/local.json) comprennent les contrôles positifs, relations optionnelles, historiques et agences. Types, lint et build de 75 pages statiques passent. Le [contrôle de sélection](evidence/20261015-operations-dashboard/browser-selection.json) compte désormais 434 cas, 217 par surface ; il ne les exécute pas.

Les délais existants restent conservés : 240 secondes par défaut, 15 minutes pour l'audit UI et 45 minutes par job. Les seuils de couverture et audits sont inchangés. La nouvelle CI doit qualifier ce code ; les [résultats antérieurs de a01ce4c](evidence/20261014-candidate/ci-a01ce4c.json) et les [contrôles du reporter](evidence/20261014-candidate/reporter-probe.json) restent datés.

Le [nettoyage distant autorisé](evidence/20261015-ci-storage/README.md) a traité les 269 identifiants sauvegardés : 256 supprimés, 13 déjà absents. Les 269 ZIP locaux et les 750 autres artefacts sont conservés et vérifiés. Le recalcul du quota n'est pas prouvé par cette suppression ; les uploads du candidat a39e5a5 restent refusés.

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
