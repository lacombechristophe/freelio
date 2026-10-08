# Qualification du candidat Freelio

État du 8 octobre 2026. Branche `codex/functional-completeness-20261003`, [PR #8](https://github.com/lacombechristophe/freelio/pull/8) en brouillon. Main et la démo hébergée sont une livraison distincte. Les résultats ci-dessous ne constituent pas une certification du produit ou de ses fournisseurs.

Dernière référence entièrement qualifiée : **a98f275**, avec deux CI vertes. Le détail d’affaire approuvé est ensuite corrigé dans 6578c47 et ses E2E préparés dans c88a0c6 ; ce complément passe localement mais attend sa propre CI. Les paragraphes historiques ci-dessous conservent les résultats antérieurs.

Le candidat complète les historiques Fournisseurs, l’import et les rapprochements bancaires, les droits Sales/Finance Client et [Suivi client](qualification-suivi-client-droits-20261008.md), puis le [contexte des requêtes différées](qualification-contexte-auth-20261008.md). Les deux CI de **949adca** passent types, les deux moteurs de lint, build, couverture, **1 023 tests SQLite / 163 fichiers**, **1 022 PostgreSQL et une exclusion native SQLite**, **175 E2E et 19 exclusions historiques**, neuf contrôles Linux et audits à zéro. Les huit parcours Suivi client passent sur ordinateur/mobile ; la démo hébergée reste une référence distincte.

Les deux CI de 81aa846 passent 1 020 SQLite, 1 019 PostgreSQL plus une exclusion native et neuf contrôles Linux. Le navigateur donne 173 réussites, deux échecs Owner sur un sélecteur ambigu et 19 exclusions historiques. Six des huit nouveaux parcours Suivi client passent ; le sélecteur vérifie désormais séparément résumé et alertes. Les trois cas de collision de nom des règles recommandées et leur correctif sont postérieurs à cette CI. La [preuve](evidence/20261008-customer-success-permissions/ci-81aa846.json) conserve cet échec sans qualifier ces nouveaux changements.

La [découverte locale corrigée](evidence/20261008-customer-success-permissions/local-discovery.json) compte 194 cas / 41 fichiers. Les anciennes découvertes de 196 / 42 incluaient un probe temporaire absent du dépôt, désormais archivé hors du dossier de tests ; les inventaires `src`, unitaires et E2E correspondent au dépôt. Les 19 exclusions navigateur comprennent quinze doublons mobiles de parcours anciens exécutés sur ordinateur et quatre contrôles propres à un format. Elles limitent la couverture des mutations mobiles ; les huit nouveaux parcours Suivi client ne sont pas exclus.

La [preuve PostgreSQL bancaire avant/après](qualification-rapprochements-bancaires-20261008.md) reproduit quatre courses puis leur correction sur e0726f6. Le débordement Fournisseur de 41238b0 est corrigé : la CI de PR 5b72db6 réussit, sa CI de branche échoue ailleurs. Sur 3be747d, les deux CI échouent sur quatre sélecteurs du nouveau test Client : « Créer un devis » expose le rôle bouton. Le sélecteur est corrigé sans modifier le produit ni assouplir d’assertion ; les deux CI 653cddc réussissent ensuite. Les [qualifications Fournisseurs](qualification-fournisseurs-historiques-20261008.md) et [Client](qualification-fiche-client-droits-20261008.md) conservent ces résultats. Main et le déploiement restent inchangés.

## Référence de code qualifiée en CI

La fiche Client reproduit douze échecs avant correction, puis dix-sept réussites en SQLite et PostgreSQL. Le [complément approuvé d’annuaire et CSV](qualification-annuaire-client-droits-20261008.md) reproduit vingt échecs sur trente cas avant correction, puis trente réussites ; les douze parcours fiche/CSV et quatre Fournisseurs restent réussis dans les deux nouvelles CI. Les 29 cas Suivi client et sept cas de contexte d’autorisation passent aussi sur les deux moteurs.

**a98f27511909ff6a506fcefe55ee1e297ff2f6e6** : la [CI de branche](https://github.com/lacombechristophe/freelio/actions/runs/37842778495) et la [CI de PR](https://github.com/lacombechristophe/freelio/actions/runs/37842784893) réussissent. La fusion de test a bien main et ce candidat pour parents. Les [métadonnées](evidence/20261008-context-module-reload/ci-a98f275.json) conservent rapports, empreintes, exclusions et identité des fichiers hors documentation. Cette référence qualifie aussi les synthèses par domaine, les 22 réponses Client et le contexte partagé entre modules, avec Handlebars 4.7.10 ; le complément ultérieur du détail d’affaire est distinct.

| Contrôle | Résultat de branche |
| --- | --- |
| Types, deux moteurs de lint, build et couverture ciblée | Réussis |
| SQLite | 1 247 tests / 171 fichiers |
| PostgreSQL | 1 246 réussis, une exclusion native SQLite |
| Navigateur | 225 réussis ; 19 exclusions historiques |
| Image Linux | Neuf contrôles réussis |
| Audit production / complet | Zéro vulnérabilité |

La [référence précédente 71ebdca](evidence/20261008-shared-health-permissions/ci-71ebdca.json) conserve ses deux CI vertes, 1 186 SQLite, 1 185 PostgreSQL et une exclusion native, 213 E2E et les 19 exclusions, Linux et audits. Les échecs Viewer de fda7be9 et le blocage Handlebars de 77dbf8d restent conservés séparément de la réussite actuelle.

Le rapport automatisé historique de 949adca couvre 65 routes sur chaque format, sans résultat P0/P1/P2/P3. Il ne certifie ni toute l’accessibilité ni tous les états du produit. La [référence précédente 653cddc](evidence/20261008-client-directory/ci-653cddc.json) reste conservée avec ses deux CI vertes et sa propre fusion de test.

La [qualification Banque/Fournisseurs](qualification-banque-fournisseurs-20261008.md) conserve l’échec du CSV sur la PR ff3b0f3, sa correction et les résultats ultérieurs. Les [preuves historiques Next/studios](evidence/20261008-next-studios/README.md) et le [journal](journal-recettes-completude-20261003.md) conservent leurs versions et leurs limites. Aucun résultat antérieur n’est attribué aux nouveaux historiques ou à l’import concurrent.

## Portée des derniers lots

La reprise humaine des séquences est implémentée dans **38bd589**, avec contrat et preuves dans **1598302**. Localement : 800 tests SQLite / 149 fichiers, types/lint/build réussis. Les opérations vérifient sans émission, réparent l’historique avec inscription conservée en pause, ou classent avec motif/confirmation et arrêt de l’inscription. Leurs [règles et limites](contrat-reprise-humaine-sequences.md) expliquent notamment le thread vide possible après rollback et l’absence de progression implicite.

Les CI de 1598302 étaient interrompues avant SQLite/navigateur par les nouveaux avis Next. Les deux CI de f5573b0 qualifient désormais les parcours de reprise et de studios sur ordinateur/mobile ; leurs contrôles fonctionnels réussissent et seul l’audit complet échoue.

Le correctif minimal **16.3.8** est implémenté dans **e9c2519** : audits du lockfile et de l’installation physique, zéro vulnérabilité en production et cinq hautes de développement dans la chaîne braces. La [qualification Next](qualification-next-20261008.md) conserve les sources et versions. Les lectures complètes des studios et inscriptions sont [approuvées et implémentées](contrat-listes-automatisations-completes.md) dans **151007b**, après la désactivation des commandes de reprise en démo publique (**39bc392**). Recette locale commune : **809 tests SQLite / 150 fichiers**, types/lint réussis, build de 74 pages réussi. La découverte locale de 160 E2E / 36 fichiers reste distincte de leur exécution CI : 139 réussis et 19 exclus dans son environnement. Aucun navigateur local récent n’est annoncé exécuté.

## Comment reproduire les preuves

Utiliser une copie isolée avec les dépendances du lockfile, une base neuve et des clés fictives. Ne pas recopier les .env, données ou identifiants existants. Le [guide de contribution](../CONTRIBUTING.md), les scripts npm et le [workflow CI](../.github/workflows/ci.yml) donnent les commandes versionnées. Le journal historique conserve la référence de chaque exécution et ses corrections ; il ne sert pas de résultat courant.

Les tests SQL emploient les vraies actions, transactions et contrôles selon leur périmètre ; les tests fournisseur emploient HTTP simulé. Vérifier les mocks du fichier concerné avant d’interpréter son résultat. Un `playwright test --list` prouve uniquement le chargement des tests. Aucun navigateur local récent n’est annoncé exécuté ; les E2E récents proviennent de GitHub.

Le [rapport de volume](evidence/20261008-workflow-journal/README.md) donne le script, sa version, son empreinte, le moteur et les mesures de 10 000 exécutions. Le contrôle de publication inspecte sources et blobs historiques, mais ne garantit pas universellement l’absence de secret. Ces contrôles ne démontrent ni charge hébergée, ni fournisseur réel, ni SIGKILL pendant un commit.

## Ce qui reste à fermer

Les trois lots [Catalogue, Sites/parc et Analyses Service](qualification-catalogue-sites-service-20261008.md) sont approuvés et implémentés. Les deux CI de 3def5cd passent 1 100 SQLite, 1 099 PostgreSQL plus une exclusion native, Linux et audits ; le navigateur donne 191 réussites, deux sélecteurs Catalogue ambigus et 19 exclusions historiques. Les assertions sont conservées et le sélecteur corrigé dans 5cbdbf0. Les 20 échecs initiaux des Analyses Service restent conservés ; leurs 40 cas étendus et huit E2E passent dans les deux CI.

Le candidat local suivant ajoute deux gardes du [montant de renouvellement](evidence/20261008-client-profile-finance/README.md), puis le [lot approuvé des scores partagés](contrat-scores-partages-droits.md) : 17 divulgations reproduites, 65 contrôles SQL étendus réussis et vingt parcours navigateur préparés. Types/lint, 1 186 tests SQLite dans 168 fichiers et build de 75 pages passent. La découverte charge 232 E2E dans 45 fichiers ; les deux CI vertes de 71ebdca passent ensuite 1 185 PostgreSQL et une exclusion native, 213 E2E et les 19 exclusions historiques, Linux et audits.

Le [lot des synthèses par domaine](contrat-espaces-domaines-droits.md) est approuvé puis implémenté dans 18b5139. La régression reproduit 17 défauts sur 23 cas ; 31 contrôles étendus passent après correction. Les types, les deux lints, 1 217 tests SQLite / 169 fichiers et le build de 75 pages passent sur 7238567. La découverte charge 244 cas / 46 fichiers ; douze nouveaux cas navigateur vérifient les encarts et les synthèses autorisées. Leurs résultats CI restent distincts du chargement local.

Le [filtre des réponses de mutation Client](evidence/20261008-client-mutation-response/README.md) ferme un chemin supplémentaire dans création, modification et prochaine action, sans changement d’écran. La comparaison de six cas reproduit trois réponses Sales trop larges ; 22 contrôles étendus passent après correction dans 852a67c. Types/lints, 1 239 tests SQLite / 170 fichiers et build de 75 pages passent. Ce complément conserve les champs stockés et les réponses Owner/Admin ; sa CI propre et les autres lecteurs Client imbriqués restent distincts.

Les [deux recettes de fda7be9](evidence/20261008-workspace-access/ci-fda7be9.json) donnent 223 E2E réussis, deux échecs Viewer et 19 exclusions chacune. Les 31 cas de synthèse passent sur PostgreSQL, mais la page compilée affiche le total d’une agence interdite. Ces runs sont `cancelled` après interruption humaine ; ils ne sont pas verts. La [reproduction entre modules](evidence/20261008-context-module-reload/README.md) confirme ensuite quatre défauts et le correctif fc9c91a les ferme localement. Types/lints, 1 247 SQLite / 171 fichiers et build de 75 pages passent ; le nouveau runtime compilé et PostgreSQL doivent encore passer leur CI.

Les deux [CI de 77dbf8d](evidence/20261008-handlebars/ci-77dbf8d.json) valident ensuite 1 246 PostgreSQL et une exclusion native SQLite, dont les huit cas de contexte, les 22 réponses Client et les 31 synthèses, ainsi que neuf contrôles Linux. Elles échouent sur les nouveaux avis Handlebars avant SQLite et navigateur. La [mise à jour de sécurité](evidence/20261008-handlebars/README.md) conserve ce blocage, ses sources et une correction ciblée vers 4.7.10, sans contrôle abaissé.

Le [détail d’affaire](contrat-affaire-client-droits.md) reproduit onze divulgations sur quatorze assertions. Le complément approuvé dans 6578c47 borne client, devis et chantiers à la société/agence et masque les caches inaccessibles. Ses 23 régressions, types/lints, 1 270 SQLite / 172 fichiers et build de 75 pages passent localement. Les huit nouveaux E2E de c88a0c6 sont découverts parmi 252 cas / 47 fichiers ; PostgreSQL et navigateur doivent encore qualifier ce code.

Les deux CI de a98f275 qualifient entre-temps les synthèses et le contexte compilé : les douze E2E passent, dont Viewer à 100 € et Owner à 300 €. Les 31 synthèses, huit contextes et 22 réponses Client passent sur PostgreSQL. Ces résultats ne sont pas attribués au nouveau détail d’affaire.

- Suivi client et contexte d’autorisation sont qualifiés par les deux CI de 949adca. Les Analyses Service passent leur recette SQL et navigateur dans les deux CI de 3def5cd, dont l’échec global Catalogue est conservé. Les lecteurs de scores partagés passent les deux CI de 71ebdca ; les synthèses et le contexte entre modules sont qualifiés par a98f275. La CI du détail d’affaire, les autres lecteurs imbriqués et les traces/sorties des automatismes restent à fermer. La [séparation des règles Next](../tooling/lint/README.md) retire la chaîne vulnérable, sans seuil réduit ni contrôle retiré.
- Banque : historique, correspondances, dates impossibles et récupération du CSV qualifiés par 1e5e3bc ; [import concurrent](qualification-import-bancaire-concurrent-20261008.md) et [trois rapprochements](qualification-rapprochements-bancaires-20261008.md) passent PostgreSQL. Autres entrées de paiement, remboursements, avoirs, réservations et stress restent à qualifier.
- Fournisseurs : [lot approuvé et implémenté](contrat-fournisseurs-gestion.md), [historiques et indicateurs](contrat-fournisseurs-historiques.md) qualifiés par les deux CI de 653cddc. Autres sélecteurs encore plafonnés, préférences Marketing, référentiels et chaînes métier de L8 ; installation/récupération et trois démonstrations de L9.
- Qualification de comptes fournisseur, délivrabilité, stockage distant et charge avant usage commercial. Ces opérations restent hors recette fictive et budget de 0 €.

Le [plan fonctionnel](plan-completude-fonctionnelle-20261002.md) détaille ces travaux. La [carte des preuves](carte-des-preuves.md) relie les risques aux fichiers de test ; la [revue CTO](revue-cto.md) donne le parcours de présentation. Les décisions d’interface déjà approuvées sont conservées dans leurs contrats.
