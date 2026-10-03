# Complétude fonctionnelle — recette du 3 octobre 2026

Branche : `codex/functional-completeness-20261003`, PR #8 en brouillon. La livraison publique sur `main` demeure distincte de ce candidat. Ce document complète le registre du 2 octobre ; il ne clôture pas les lots L5–L9.

## Marketing administrable (sous-lot L6 / UI-04)

Autorisation visible : correction explicite « oui appliquer, ne pas conserver l’interface actuelle je me suis trompé ». Les cartes, champs, couleurs et structure des trois onglets sont conservés.

- Modifier une règle ou les critères d’un segment avec comparaison de `updatedAt` ; refuser les écritures obsolètes. Le type d’un segment reste immuable.
- Dupliquer avec un nouveau nom confirmé. La copie est active ; l’avertissement explique son effet sur le scoring. Une liste statique copie tous ses membres par lots de 400 dans une transaction sérialisable. Une liste active attend un recalcul.
- Archiver sans supprimer l’historique. Les règles archivées quittent les prochains recalculs ; les segments archivés restent consultables. Les campagnes actives verrouillent l’édition, l’archivage et les changements de membres.
- Ajouter/retirer les membres d’une liste statique ; refuser toute référence à un prospect d’une autre société et éviter les doublons. Une requête traite au plus 500 identifiants.
- Paginer prospects et membres par 50, avec ordre stable. Exposer uniquement les champs utiles, sans empreinte de capture. Les compteurs de score portent sur l’ensemble des prospects actifs.
- Prévisualiser tous les prospects par lots de 400 et afficher au plus 25 exemples. L’aperçu utilise les scores enregistrés et ne donne aucune autorisation d’envoi. Il est informatif, sans snapshot d’audience ; l’activation de campagne reste un chantier distinct.

Recette SQL : `tests/unit/marketing-administration.integration.test.ts` couvre accès inter-sociétés, conflit d’édition, verrou de campagne, 551 prospects avec 510 correspondances, pagination complète, copie de 401 membres et rollback d’un ajout mêlant deux sociétés. Les tests de recalcul couvrent déjà 5 001 et 10 001 prospects.

Recette navigateur : `tests/e2e/marketing-administration.spec.ts` vérifie création, édition, duplication, archivage, aperçu et ajout/retrait de membres sur ordinateur et mobile : **2/2 réussis** dans la compilation de production isolée (10,2 s avec setup).

## OAuth et confidentialité des messageries (L3/L4 partiels)

Les capacités mail/calendrier sélectionnées limitent les scopes demandés et les traitements. Une capacité désactivée ne contacte pas le fournisseur et affiche « Non activé ». Le partage exige un acquiescement explicite. Les boîtes historiques sans propriétaire sont classées `LEGACY`, accessibles aux administrateurs pour réconciliation.

Les lectures directes, relations imbriquées et compteurs des historiques mail/calendrier respectent la boîte privée/partagée. Les fils historiques ne sont attribués que si tous leurs messages correspondent à une seule boîte ; les événements de calendrier historiques non attribuables restent masqués aux membres ordinaires.

OAuth consomme le nonce une seule fois, lie la tentative au membre, refuse une configuration remplacée pendant le consentement et nettoie les cookies sur tous les retours. Les identités fournisseur des messages/événements sont uniques dans chaque société. Les webhooks Resend sont routés par signature ; avec un secret partagé ambigu, configurer une URL dédiée `/api/webhooks/resend?channelId=<identifiant>` pour chaque boîte.

Ces preuves reposent sur SQL et HTTP simulé. Aucun compte Google/Microsoft/Resend réel n’a été qualifié ; aucune campagne réelle n’est autorisée par cette recette. Restent notamment la réconciliation history/delta du mail, les réponses natives, pièces/brouillons, délais fournisseur et le transfert de boîtes au départ d’un membre.

## Vérification et limites

Environnement de recette séparé : copie sans `.env`, dépendances du lock, SQLite fictive, clés artificielles, aucun fournisseur configuré. Aucun changement de données sur la démo locale existante ni sur la démo publique.

La première CI de PR #8 a révélé un compteur de migrations figé et une fixture de campagne sans boîte expéditrice. Les corrections comparent désormais les noms exacts de toutes les migrations et déclarent une boîte fictive sans credentials. Elles nécessitent une nouvelle CI du SHA candidat.

La suite locale atteint **499 tests réussis dans 116 fichiers** (60,34 s), dont le test de capacités désactivées. Types, lint et compilation Next 16.3.6 de production passent. La recette ciblée additionnelle obtient **4 E2E réussis et 2 exclusions mobiles explicites** (15,7 s) : campagne avec sa propre séquence, recalcul/Communications, administration Marketing desktop/mobile.

CI de `6f2af30dc535f8a7cf62888f1cfcf57031710e34` : les jobs **Intégration PostgreSQL** et **Image Linux et Chromium** réussissent sur le push et la PR. [Run PR](https://github.com/lacombechristophe/freelio/actions/runs/37086304413). Le job qualité est bloqué avant sa recette par l’audit npm.

### Alerte de dépendance conservée comme blocage

L’avis [GHSA-vfj7-8cjw-p6xm / CVE-2026-93687](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), revu le 2 octobre, affecte `braces <= 3.0.3` sans correctif publié au 3 octobre. npm remonte huit alertes hautes dans sa chaîne transitive. Les motifs profondément imbriqués peuvent provoquer un épuisement de pile.

`shadcn` est un générateur CLI de développement : aucune source applicative ne l’importe. Il est désormais correctement classé en `devDependencies`, sans changement de version ni résolution du lock. **`npm audit --omit=dev --audit-level=moderate` retourne zéro vulnérabilité**. Cela ne corrige pas l’alerte des outils de développement.

La CI contrôle séparément les dépendances de production puis exécute types/lint/tests/build/E2E avant l’audit de toutes les dépendances. L’audit complet garde son seuil et son échec bloquant ; aucune exclusion ni acceptation implicite de l’avis n’est ajoutée. Cette organisation conserve les preuves fonctionnelles pendant l’attente d’un correctif amont. **La PR reste en brouillon et ne doit pas être fusionnée sur la seule réussite fonctionnelle.**

Les autres demandes d’interface non approuvées concernent la rédaction avancée, campagnes/journal d’automatisation et les écrans métier restants. Le lot Marketing approuvé ne comprend pas de gestion nouvelle des préférences de consentement ni de scoring santé client.

## Complément : reprise des séquences et lecture des conversations

Commits applicatifs : `7d9e961` (reprise des envois) et `e6cd30e` (lecture). L’autorisation « Oui, appliquer ce lot » porte sur recherche, filtres Toutes/Non lues/Archives, pagination des fils et Messages précédents, dans le style existant.

Les envois de séquence figent destinataire, sujet, contenu, expéditeur et liens de désinscription avant le transport. Une acceptation distante est enregistrée avant le calcul de progression et l’historique ; une panne SQL ultérieure conserve cette acceptation. Le processeur répare l’historique même si la campagne est en pause, sans renvoyer le message. Une pause de l’inscription pendant le transport n’est pas écrasée. Les envois manuels et de séquence conservent aussi le nom expéditeur malgré le renommage ultérieur d’une boîte ; une adresse devenue différente bloque la reprise. Une livraison historique sans contenu figé reste à réconcilier manuellement, sans inventer son message.

Les conversations sont paginées par 50 avec compteurs SQL sur tout le périmètre accessible. Le fil affiche ses 25 derniers messages et remonte les précédents par curseur `(createdAt, id)`. Recherche, filtres, compteurs, curseurs et messages respectent les droits société/boîte ; les DTO n’exposent ni identifiant fournisseur, ni CCI, ni payload d’événement. La consultation publique en lecture seule ne tente pas de marquer un message lu et la recherche demeure disponible.

La recette SQL couvre 126 fils visibles, 101 messages horodatés à l’identique, les corps anciens recherchables, les archives, les pages hors limites, les IDs de boîtes privées et d’autres sociétés. Les tests d’envoi injectent une panne d’historique, un délai distant ambigu, une modification du modèle et une pause pendant l’acceptation. **509 tests passent dans 118 fichiers** (57,53 s) ; lint et compilation de production passent. **4 E2E ciblés passent** (8,7 s) pour lecture complète et conservation du parcours de messagerie sur ordinateur/mobile.

La pagination du sélecteur de contacts (encore borné à 500), les réponses natives fournisseur, les pièces/brouillons et la réconciliation lu/supprimé restent distincts. MAIL-06 est donc partiellement traité ; cette recette ne clôture pas toute la messagerie.

La CI du précédent SHA `72ac53101861ccf38ca403632fc19ce8decd4872` a terminé : **PostgreSQL et Linux/Chromium réussissent ; qualité obtient 499 tests et 81 E2E réussis, avec 19 exclusions explicites**. [Run PR](https://github.com/lacombechristophe/freelio/actions/runs/37086758605). Son seul échec est l’audit complet de dépendances décrit ci-dessus. Les nouveaux commits nécessitent leur propre CI ; les preuves du précédent SHA ne s’y substituent pas.

## Départ d’un membre : déconnexion locale des messageries

La désactivation d’un membre et la suppression des credentials de ses boîtes privées/partagées sont désormais une seule transaction sérialisable. Les tentatives OAuth en cours sont annulées, ce qui interdit à leur callback de réactiver ces connexions. Le contrôle du dernier propriétaire est relu dans cette transaction. Les boîtes d’une autre société et celles des autres utilisateurs restent intactes ; les historiques et leur propriétaire d’origine sont conservés.

`member-mailbox-offboarding.integration.test.ts` qualifie ces cas sur SQL réel, y compris une autorisation d’acteur devenue ancienne et des identifiants inter-sociétés. La suite locale complète atteint **512 tests réussis dans 119 fichiers** (58,79 s) ; les 11 tests ciblés départ/OAuth/synchronisation, types et lint passent. Cette correction ne constitue pas une révocation distante ni une interface de transfert de propriété : ces points restent à qualifier séparément. Aucun token fournisseur réel n’est utilisé.

CI de `c3bdcbbc0f049bf38dc1f3211627cba3a082e376` : PostgreSQL et Linux/Chromium réussissent déjà ; les parcours navigateur sont en cours au moment de ce complément. [Run PR](https://github.com/lacombechristophe/freelio/actions/runs/37091358824). Le complément départ d’un membre nécessite ensuite sa propre CI.

## CI achevée du départ d’un membre

La CI de `a530980a3ec846027e4f01e519bf178345efda3b` a terminé : **PostgreSQL et Linux/Chromium réussissent ; qualité valide 512 tests et 83 E2E, avec 19 exclusions explicites**. Types, lint, couverture, compilation et audit des dépendances de production passent. L’unique échec du job qualité reste l’audit complet décrit ci-dessus. [Run PR](https://github.com/lacombechristophe/freelio/actions/runs/37091906019).

## Portefeuille Suivi client complet (sous-lot L8 / CS-01)

Autorisation visible : « Oui, étendre au portefeuille complet ». La recherche, le filtre santé et la pagination existants sont conservés. La mention du portefeuille limité à 300 clients devient celle du portefeuille complet de la société ; aucun champ, couleur ou disposition n’est ajouté.

L’autorisation antérieure de désactiver les écritures dans la démo publique est aussi appliquée aux commandes « Figer les scores » et « Archiver » des règles : elles utilisent la garde existante des boutons. La garde serveur bloquait déjà ces écritures. La démo locale modifiable conserve ces commandes.

La lecture parcourt tous les clients par curseur de 200, calcule leurs signaux sans échantillonner l’historique, puis priorise et filtre le portefeuille entier. Seuls les profils de la page de 25 clients atteignent le navigateur. Les compteurs couvrent le portefeuille entier indépendamment du filtre ; les requêtes conservent le périmètre société/agence de l’acteur. L’ordre inclut un identifiant de départage et une page hors limites revient à la dernière page disponible.

Les tickets fusionnés sont exclus ; les factures brouillon, annulées, payées, avoirs et échéances futures ne deviennent pas des impayés. Le solde est plafonné à zéro par facture, pour qu’un trop-perçu ne masque pas une autre dette. Les réponses de satisfaction sont pondérées par leur nombre et normalisées selon l’échelle de chaque enquête. La date de renouvellement explicite prime sur le premier terme daté d’un contrat actif, même après plus de 100 contrats sans terme.

« Figer les scores » parcourt également tous les clients. Un bail interdit les recalculs concurrents ; scores, snapshots et événements durables partagent une transaction sérialisable. Une panne après le premier lot annule l’ensemble. Le snapshot quotidien utilise la date du dernier relevé, indépendamment d’un recalcul plus récent. Le recalcul persistant global exige un administrateur ayant accès à toute la société ; un acteur limité à ses agences ne peut pas enregistrer des scores globaux à partir de ses seuls signaux.

`customer-success.integration.test.ts` couvre 1 001 clients, 501 tickets/factures, 101 contrats et 102 réponses sur deux échelles, une autre société, les signaux limités à une agence, le recalcul répété, le relevé quotidien, la concurrence et un rollback au 201e événement. La suite locale finale obtient **522 tests réussis dans 120 fichiers** (76,46 s) ; types, lint et compilation de production passent. Le parcours SAV existant est étendu à la saisie rapide, au filtre, au retour depuis une fiche et au portefeuille complet : **2 E2E réussis sur ordinateur/mobile** (9,2 s, puis à nouveau 2,7/3,0 s après le correctif de programmation).

La CI intermédiaire `1c9fd83` valide Linux/Chromium et PostgreSQL : **520 tests passent, un test de sauvegarde native SQLite est exclu sous PostgreSQL**, dont les sept tests Suivi client réussis. La qualité valide types/lint, 521 tests, couverture et build ; 82 E2E passent et 19 sont exclus. Le parcours d’automatisation échoue sur la tâche immédiate retardée par l’arrondi ; le correctif ci-dessous nécessite une nouvelle CI du SHA final. [Run PR intermédiaire](https://github.com/lacombechristophe/freelio/actions/runs/37123950259).

### Borne de programmation des campagnes

La suite complète a reproduit un arrondi de minute qui pouvait programmer une étape quelques secondes avant son départ ou son délai. La date conserve désormais ses secondes et millisecondes, puis est validée contre la fenêtre d’envoi. L’arrondi vers la minute suivante, envisagé initialement, retardait les étapes immédiates et a été remplacé avant fusion. Trois cas déterministes couvrent un délai, la limite de fermeture et une action immédiate. Cette correction serveur ne modifie aucune commande visible.

Les **18 tests ciblés programmation/campagne passent**. Le parcours « configures an email sequence and a lead automation » est rejoué seul sur une base SQLite neuve : **1 E2E réussi** (25,7 s avec préparation). Il crée sa propre règle pour déclencher le changement de santé et ne dépend plus du passage préalable d’un autre test SAV. Il vérifie la tâche immédiate, sa clôture, la fin de séquence et l’action déclenchée par le changement de score.

### Recalcul santé et volume d’automatisations

La CI de `5895f9e839e520241be7e9bdf9c48ed346a9fd5c` valide PostgreSQL (**521 tests, une exclusion SQLite**) et Linux/Chromium. Types, lint, 522 tests SQLite, couverture et compilation réussissent. Le navigateur obtient 81 réussites et 19 exclusions, mais deux échecs : le recalcul lance 50 traitements concurrents qui saturent les écritures SQLite, puis bloquent le parcours campagne suivant. L’audit complet demeure également bloquant. [Run PR](https://github.com/lacombechristophe/freelio/actions/runs/37125259348).

Le recalcul persiste toujours tous les scores, snapshots et événements dans sa transaction. Après le commit, il tente dix événements séquentiellement ; les autres restent dans l’outbox et le worker existant les traite par lots. Le nombre retourné de workflows correspond aux traitements immédiats terminés, pas à tous les scénarios inscrits. Le worker doit fonctionner pour achever les événements différés ; aucune promesse de traitement intégral synchrone n’est ajoutée.

Un test SQL utilise 51 clients et un scénario publié réel : dix tâches sont créées immédiatement, les 41 restantes après passage du processeur, puis une nouvelle exécution ne crée aucun doublon. La suite complète passe à **523 tests dans 120 fichiers** (105,59 s). La compilation de production et le lint ciblé réussissent.

La trace navigateur sur 126 clients mesure environ 17 secondes entre lancement du recalcul et achèvement des traitements immédiats, sans les erreurs de contention précédentes. Le test de portefeuille complet attend désormais au plus 60 secondes, en conservant la vérification de la confirmation et de la tâche métier ; les attentes des autres commandes ne changent pas. Cette mesure décrit une recette locale SQLite, pas un engagement de performance de production. Le recalcul atomique conserve son timeout serveur de 120 secondes et nécessite une qualification supplémentaire pour des portefeuilles bien plus volumineux.

Sur une nouvelle base fictive de 126 clients, la recette ciblée complète obtient **4 E2E réussis et 2 exclusions mobiles explicites** (37,9 s avec préparation) : automatisation 13,2 s, campagne 2,6 s, portefeuille SAV ordinateur/mobile 2,6/2,9 s. La tâche santé du client QA est vérifiée après la confirmation. Une nouvelle CI doit qualifier ce correctif sur son SHA exact ; les réussites PostgreSQL/Linux du précédent commit ne s’y substituent pas.

### Raccordement du worker à l’outbox

La relecture des points d’entrée a révélé que `/api/automations/process` drainait déjà les événements mais que `npm run worker` ne traitait que les séquences. Le worker utilise désormais le même traitement que la route : jusqu’à 50 événements séquentiels, puis 100 inscriptions de séquence, chaque minute. Une famille en erreur ne supprime pas la tentative de l’autre. Le profil public continue d’interdire ce worker ; aucun ordonnanceur distant ni fournisseur n’est activé.

`automation-processing.test.ts` vérifie l’ordre sans écritures concurrentes entre ces deux familles, les deux erreurs conservées, la route protégée et son HTTP 503 partiel, et l’appel effectif de l’outbox par la tâche périodique du module worker. Les quatre tests passent ; les huit tests SQL santé, dont les 51 scénarios différés, passent également. Le runbook corrige aussi son ancienne description des baux non renouvelés, devenue obsolète après le durcissement du processeur.

### CI achevée du recalcul et du worker

Référence `9e9939638cfa4ec01ade994abf0b584a8271b834` : **527 tests SQLite dans 121 fichiers**, couverture, types, lint, compilation et audit de production passent ; **83 E2E réussissent, 19 exclusions explicites**. PostgreSQL réussit avec 526 tests et une exclusion de sauvegarde native SQLite. Les huit contrôles Linux réussissent, dont migration de 48 migrations, Redis/BullMQ, PDF réel et arrêt gracieux du worker. Le rapport téléchargé porte le SHA exact et l’image `sha256:1dd604aa1a3f4f45e6d3035727205464945f65d5cfd4229858a5344273bc4000`. [Run push exact](https://github.com/lacombechristophe/freelio/actions/runs/37128276369), [run PR](https://github.com/lacombechristophe/freelio/actions/runs/37128279363).

Les deux runs échouent uniquement à l’audit complet : huit alertes hautes de développement, liées à l’avis `braces` décrit plus haut. Aucun seuil n’est abaissé ; la PR reste en brouillon. Ce succès fonctionnel ne clôture pas les lots L5–L9 ni la qualification fournisseur.

## Réponse mail : validation de la boîte avant transport

Reproduction SQL : une conversation de la boîte B est passée à une commande expédiée par A. Avant correction, le transport simulé est appelé et accepte le message ; seul `recordOutgoingEmail` rejette ensuite le fil incompatible. Une nouvelle tentative ne résout pas cette incohérence.

La commande contrôle maintenant la société, le client et la boîte du fil avant de créer la livraison durable. Le même contrôle est relu immédiatement avant le dispatch fournisseur pour refuser un changement concurrent. Les références inter-sociétés/inter-clients sont également refusées sans préparation ni transport. Une réponse valide conserve son fil ; l’historique déjà accepté garde sa réparation sans nouvel envoi.

Quatre cas SQL supplémentaires couvrent mauvaise boîte, autre société/client, changement entre préparation et dispatch puis reprise, et réponse valide sans nouveau fil. **15 tests ciblés** messagerie/ACL/raccordement passent. Il s’agit d’une correction serveur sans changement de commande visible. Elle ne crée pas les références de réponse natives Gmail/Graph : MAIL-05 demeure partiel et aucun échange fournisseur réel n’est revendiqué.

La suite locale complète atteint **531 tests réussis dans 121 fichiers** (93,50 s) ; types et lint ciblé réussissent. Le nouveau commit nécessite sa propre CI, distincte du succès fonctionnel de `9e99396`.

## Lecture actuelle du registre de complétude

Le registre du 2 octobre décrit les constats initiaux ; ses lignes « ouvertes » ne constituent pas un état courant après les corrections. Cette synthèse indique les preuves obtenues sans fermer les lots entiers.

| Registre | Résultat vérifié dans ce candidat | Limite encore ouverte |
|---|---|---|
| MAIL-01, CAL-01 | Pagination avec continuation persistée, capacités indépendantes ; SQL et fournisseurs HTTP simulés | Réconciliation history/delta mail, suppressions/lu et échanges réels |
| MAIL-03, OPS-03 | Commandes d’envoi et contenu/expéditeur figés ; acceptation distante et réparation d’historique séparées | Qualification fournisseur, ambiguïtés historiques sans snapshot |
| MAIL-05/06 | Boîte d’origine sélectionnée, parent figé et réponses natives sous HTTP simulé ; conversations/messages/contacts paginés et archives accessibles | Qualification fournisseur et réconciliation des références historiques manquantes |
| MAIL-07, OAUTH-01/04 | Unicité par société, webhooks routés, ACL de boîte, nonce unique, refresh/cursor avec contrôle concurrent | Qualification comptes réels, revue continue des nouvelles entrées |
| OAUTH-02/03 | Capacités/scopes sélectionnés ; déconnexion locale correctement nommée, cookies nettoyés, départ d’un membre atomique | Révocation distante, transfert de propriété, Microsoft personnel |
| MKT-01/02/03 | Recalcul complet 5 001/10 001, administration approuvée, listes statiques, aperçu et pagination | Préférences de consentement, critères/exclusions avancés, audience figée de campagne |
| CAMP-01, AUTO-01/02/03/04 | Pause/dates contrôlées, événements et checkpoints durables, versions publiées figées, reprise sans recommencer l’inscription | Préflight/audiences de campagne, attentes et journal détaillé de scénario |
| OPS-01/02 | Deadlines fournisseur, baux renouvelés avec contrôle de propriétaire ; route et worker drainent l’outbox | Ordonnanceur hébergé, alertes et reprise après arrêt brutal sur runtime final |
| CS-01 | Portefeuille entier, historiques agrégés, recalcul atomique et événements différés repris | Mesure de performance à des volumes supérieurs sur PostgreSQL final |
| MAIL-04 | CC/CCI validées, commandes figées et brouillons privés versionnés à sauvegarde manuelle | Pièces sortantes, programmation, signatures/texte et réponses à tous/transferts ; L5 demeure partiel |
| CAL-02, CRM/BANK/portail et L9 | Non clôturés par cette recette | Calendrier avancé, référentiels métier, réservations/conflits et dossier final CTO |

Le candidat reste une démonstration fictive. L’audit complet de dépendances bloque la fusion ; HTTP simulé n’équivaut pas à une connexion fournisseur qualifiée. Aucun compteur global de tests ne transforme ces limites en fonctionnalités terminées.

## Destinataires : recherche et pagination complètes (MAIL-06)

Autorisation visible : « Oui, ajouter recherche et pagination des destinataires ». Dans « Nouvel e-mail », le sélecteur conserve son style et reçoit « Rechercher un destinataire » et la pagination existante, avec 25 contacts par page. Les boutons d’envoi et les couleurs sont conservés. Le choix demeure sélectionné en dehors de la page ou de la recherche ; il est présenté en plus des 25 résultats lorsqu’il n’en fait pas partie.

Le tableau principal ne charge plus 500 contacts complets. La lecture paginée expose seulement identifiant, prénom, nom, e-mail et identité du client. Comptage, page et résolution du contact choisi partagent une transaction sérialisable ; ils sont limités à la société de l’acteur, avec `automation.read`. Le tri ajoute l’identifiant aux prénom/nom pour stabiliser les pages. Les contacts sans e-mail ou avec une valeur vide sont exclus ; les adresses restent validées au moment de l’envoi. La recherche porte sur prénom, nom, e-mail et société cliente. PostgreSQL utilise explicitement un filtre insensible à la casse ; SQLite garde les propriétés de son `LIKE`, insensible à la casse ASCII.

Le champ attend 250 ms avant la requête, ignore la réponse d’une recherche devenue ancienne et revient à la première page au changement de texte. Une erreur conserve la sélection et propose la commande existante « Réessayer ». Entrée dans le champ de recherche ne soumet pas le formulaire d’envoi. Aucun fournisseur n’est contacté par ces lectures.

`recipient-reader.integration.test.ts` qualifie 1 001 contacts, les 41 pages sans doublons, les égalités de noms, la dernière page hors limite, le dernier contact recherchable, les champs privés absents du DTO, un choix hors filtre, les identifiants étrangers et les paramètres malformés. Les 12 tests ciblés annuaire/envoi passent. Compilation de production et lint passent. Les parcours destinataires réussissent sur ordinateur/mobile (**2 E2E, 9,7 s**) avec 551 contacts fictifs, changement de page/filtre, choix conservé et HTTP 500 simulé puis reprise ; les deux parcours de lecture mail réussissent également.

Le correctif précédent `b0dc24abe42a4a2b6f124752b56603681da31059` termine sa CI : **531 tests SQLite, 83 E2E réussis, 19 exclusions** ; PostgreSQL **530 réussites et une exclusion SQLite** ; huit contrôles Linux réussis. L’unique échec est l’audit complet des huit alertes hautes de développement. [Run du push exact](https://github.com/lacombechristophe/freelio/actions/runs/37131750419). Ces résultats ne remplacent pas la CI du nouveau sélecteur.

Ce complément retire la limite du sélecteur signalée dans la synthèse précédente. MAIL-06 n’est plus limité par les anciens plafonds de fils/messages/contacts ; cela ne clôture ni la rédaction avancée de MAIL-04 ni les réponses natives de MAIL-05.

La suite locale complète du sélecteur réussit : **535 tests dans 122 fichiers** (71,84 s). Types, lint ciblé et compilation de production réussissent. La qualification PostgreSQL et les parcours complets seront relus dans la CI du SHA poussé ; les tests locaux utilisent exclusivement les bases fictives isolées.

La CI de `29d20ac517657dae211aff42430da322f1ed8bde` est achevée : **535 tests SQLite, 534 PostgreSQL avec une exclusion native SQLite, 85 E2E et 19 exclusions explicites**. Types, lint, couverture ciblée, compilation et huit contrôles Linux passent. Les quatre tests de destinataires passent aussi sur PostgreSQL. Les artefacts téléchargés portent le SHA exact et l’image `sha256:48b8dbedecb928d33011a06176bca224f40ec8497e80ea2a5dd9db4eaac28558`. Les deux runs échouent uniquement à l’audit complet des huit alertes hautes de développement ; l’audit de production rapporte zéro vulnérabilité. [Push exact](https://github.com/lacombechristophe/freelio/actions/runs/37133807185), [PR](https://github.com/lacombechristophe/freelio/actions/runs/37133809525).

## Références natives de réponse et boîte expéditrice (MAIL-05)

Une réponse conserve maintenant une référence figée au dernier message reçu de la conversation ; à défaut de message reçu, au dernier sortant. L’identifiant local, le fournisseur, la référence distante, le Message-ID Internet, l’objet et la direction sont enregistrés dans le payload durable avant le transport. Une arrivée supplémentaire ne déplace pas cette référence lors d’une reprise. La société, la boîte, le client et le message figé sont relus avant la création distante du brouillon et avant son envoi. L’objet doit rester celui de la conversation, après normalisation des préfixes de réponse.

Gmail relit les métadonnées du parent, contrôle identité/objet/destinataire et crée le brouillon avec son `threadId` natif, `In-Reply-To` et `References`. Microsoft relit le parent sous identifiants immuables et utilise `/messages/{id}/createReply` en MIME avant de persister puis envoyer le brouillon. Le Message-ID retourné par Graph est conservé lorsqu’il est fourni. `Reply-To`, ou `From` en son absence, doit correspondre au contact choisi pour une réponse à un message reçu ; les destinations multiples ou incompatibles sont refusées, sans substitution silencieuse. Resend transmet les en-têtes de réponse avec la clé d’idempotence durable existante. Les champs de référence refusent les contrôles/injections et bornent la longueur des en-têtes.

Les connexions OAuth doivent posséder les droits de brouillon/lecture utilisés par cette stratégie, en plus de l’envoi. Les scopes demandés par Freelio les incluent déjà (`gmail.modify` ; `Mail.ReadWrite` et `Mail.Send`). Une ancienne connexion avec le seul droit d’envoi est refusée avant HTTP et demande une reconnexion. Les Message-ID OAuth acceptés sont conservés dans l’historique manuel et de séquence pour préparer les réponses suivantes. Un UUID interne Resend n’est jamais présenté comme un Message-ID Internet.

Une ancienne réponse non acceptée, sans référence figée, nécessite une vérification humaine avant toute nouvelle commande ; elle n’est pas réinterprétée avec un parent choisi après coup. Une ancienne réponse déjà acceptée peut encore réparer son historique sans nouvel envoi. Les historiques sans Message-ID valide sont explicitement refusés : leur réconciliation reste distincte de ce lot, notamment les conversations Resend constituées uniquement de messages sortants anciens. Les réponses à tous/transferts et les contacts correspondant à un Reply-To alternatif restent un lot de rédaction séparé.

Autorisation visible reçue : « Oui, sélectionner la boîte de la conversation ». « Répondre » sélectionne maintenant la boîte correspondante dans le champ Expéditeur existant ; une boîte déconnectée, inaccessible ou sans capacité mail empêche l’ouverture de cette réponse et affiche une explication. Aucun champ, bouton, couleur ou emplacement n’a été ajouté. Le serveur conserve ses contrôles indépendamment de ce confort de saisie.

Les **551 tests locaux passent dans 123 fichiers** (73,47 s). Les tests SQL/HTTP des trois fournisseurs simulent une acceptation suivie d’un timeout, une reprise puis un nouvel appel de la même commande : une seule acceptation et un seul message sortant. Pour OAuth, le brouillon est persisté avant dispatch ; Resend réutilise exactement la même clé et le même corps. Les autres cas couvrent parent absent/étranger/modifié, arrivée supplémentaire, objet ou destinataire incompatibles, injection d’en-tête et droits OAuth incomplets. Types, lint ciblé et compilation de production passent.

Sources des contrats revérifiées : [fils Gmail](https://developers.google.com/workspace/gmail/api/guides/threads), [droits de brouillon Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create), [createReply Graph v1.0](https://learn.microsoft.com/en-us/graph/api/message-createreply?view=graph-rest-1.0), [Message-ID Resend](https://resend.com/changelog/message-id-for-sent-emails). SQL réel et HTTP simulé ne qualifient pas encore une conversation chez un fournisseur réel. Aucune clé, autorisation OAuth, donnée réelle ou transmission réelle n’est utilisée par cette recette.

Les six E2E Communications passent sur la compilation de production (**17,7 s**) : lecture, destinataires et réponse sur ordinateur/mobile. Le scénario de réponse commence avec une autre boîte sélectionnée, vérifie la boîte de la conversation et le destinataire 551, puis refuse une boîte déconnectée sans ouvrir le formulaire. Sur mobile, il utilise « Retour aux conversations » avant la seconde recherche. La CI du commit poussé doit encore qualifier l’ensemble du produit et PostgreSQL.

La CI de `d8cd6b35330d37d68aa6588b6a46dc793631566f` a ensuite révélé un parcours de campagne qui ne choisissait pas de boîte pour sa séquence. La nouvelle fixture comporte deux boîtes actives ; le refus d’un choix ambigu est attendu. Types/lint/build/couverture, PostgreSQL et Linux passent ; le parcours complet rapporte 86 E2E réussis, un échec campagne et 19 exclusions. L’audit complet échoue également. Le test choisit maintenant explicitement la boîte fictive secondaire dans les réglages existants et utilise un nom de campagne unique pour les recettes répétées. Sa relance réussit (3,5 s), avec l’exclusion mobile préexistante ; aucun choix silencieux de boîte n’est introduit dans le produit. [Run push](https://github.com/lacombechristophe/freelio/actions/runs/37146020543), [run PR](https://github.com/lacombechristophe/freelio/actions/runs/37146023002).

## CC/CCI et brouillons personnels versionnés (MAIL-04, partiel)

Autorisation visible : « Oui, appliquer ce lot de rédaction ». Le formulaire reçoit les champs CC et CCI sous le destinataire, « Enregistrer le brouillon » près de l’aperçu, un onglet Brouillons permettant de rouvrir/supprimer et une mention de sauvegarde/conflit. Les couleurs et composants existants sont conservés. Il s’agit d’une sauvegarde manuelle ; l’autosauvegarde continue n’est pas revendiquée. Un brouillon peut rester sans destinataire, objet ou contenu complet.

Les listes de copies sont normalisées, limitées à 20 adresses par champ et validées avant transport. Injections, adresses ambiguës et répétitions entre À/CC/CCI sont refusées. Tous les destinataires passent les contrôles de suppression, avant préparation et à nouveau avant dispatch. Les copies figurent dans le payload durable ; changer une copie lors d’une reprise est refusé. Resend reçoit des tableaux distincts ; Gmail et Graph reçoivent les champs de l’enveloppe MIME. Les essais SQL/HTTP des trois fournisseurs incluent désormais les copies, un timeout après acceptation et une reprise sans seconde acceptation.

Le modèle `EmailDraft` lie société/auteur, version et identifiants de création/envoi. Création répétée avec la même clé et le même contenu ne duplique pas le brouillon. La lecture et toutes les mutations contrôlent société/auteur, y compris les identifiants devinés. La frontière Prisma limite également les lectures directes, includes et écritures à l’auteur, même pour un administrateur et une boîte partagée. Les listes exposent seulement objet/version/date et sont paginées ; le contenu et les CCI sont chargés lors de la réouverture personnelle.

Une sauvegarde concurrente utilise la version attendue ; une version ancienne ne peut pas écraser ou supprimer la nouvelle. Un bail renouvelé sérialise sauvegarde/suppression/envoi. La révision enregistrée fournit sa clé d’envoi côté serveur, indépendamment d’une clé fournie par le navigateur. Dès qu’une livraison est préparée, la révision ne peut plus être modifiée. Après une issue ambiguë, elle reste disponible pour reprendre le même envoi ; sa suppression est refusée tant que le résultat n’est pas confirmé. Une acceptation suivie d’un incident SQL peut réparer son historique sans nouvel envoi. Le brouillon confirmé est marqué envoyé et retiré de la liste active, conservant sa référence pour une répétition de requête.

Les conflits attendus sont retournés comme résultats structurés des actions : leur texte reste disponible dans une compilation de production. La saisie reste présente après erreur ; une confirmation permet de conserver les modifications ou de rouvrir la version enregistrée. Les fenêtres de confirmation sont ouvertes avant les transitions React, évitant une attente mutuelle constatée puis corrigée pendant la recette. Les URLs HTML déjà échappées restent identiques au fil des réouvertures/sauvegardes.

Les CCI ne sont pas sélectionnées dans les DTO de conversation. Le SAV, y compris les fils fusionnés, utilise désormais la même projection sans CCI ni payload brut d’événement fournisseur. Le journal d’automatisation possède déjà un DTO explicite sans payload ; une erreur fournisseur d’un envoi avec CCI est enregistrée sous une mention générique pour éviter de citer une adresse cachée dans ce journal partagé. Les brouillons personnels sont explicitement exclus de l’export logique de société ; la sauvegarde native chiffrée les conserve. Une restauration v2 susceptible de les effacer est refusée. La démo publique refuse les sauvegardes, suppressions et envois au niveau action et base ; les boutons concernés sont désactivés.

Validation locale : **570 tests dans 126 fichiers** (87,54 s), puis **50 tests ciblés** après le résultat structuré des conflits. Types, lint ciblé et compilation de production passent. Les **huit E2E Communications** passent sur ordinateur/mobile (22,7 s) : sauvegarde incomplète, rechargement, copies restaurées, deux onglets, conflit avec texte conservé, annulation du remplacement, réouverture de la version récente et suppression confirmée ; lecture/destinataires/réponse restent verts. Les tests utilisent exclusivement SQLite fictive et HTTP simulé. La migration PostgreSQL crée `EmailDraft` avec clés/index et références société/auteur ; son déploiement et les tests PostgreSQL restent soumis à la CI du nouveau SHA.

Contrats revérifiés : [envoi Resend](https://resend.com/docs/api-reference/emails/send-email), [enveloppe MIME Gmail](https://developers.google.com/workspace/gmail/api/guides/sending), [envoi Graph MIME](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0). Leur comportement sur comptes réels n’est pas qualifié. Ce complément ne clôture ni L5 ni le projet ; aucune fusion ni publication n’est effectuée tant que l’audit complet bloque.

La CI de `c602a3d8fa36b2dc9db1ce58628339a50ad88410` est achevée : **570 tests SQLite, 569 PostgreSQL et une exclusion native SQLite, 89 E2E et 19 exclusions explicites**. Types, lint, couverture, compilation et huit contrôles Linux passent ; les 49 migrations, dont celle des brouillons, sont appliquées sur PostgreSQL neuf. Les artefacts téléchargés portent le SHA exact et l’image `sha256:b472a81d29c14cc71bc379e19752115bcfffa6c83b45d14be910d0dc35fd65fd`. L’audit de production passe ; l’audit complet échoue sur les huit alertes hautes de développement déjà identifiées. [Run push exact](https://github.com/lacombechristophe/freelio/actions/runs/37148552816). Ce résultat clôture la recette simulée de ce lot approuvé, sans qualification de comptes fournisseur réels ni fusion de la PR.

## Relances de facture : commande durable et contrôle du solde

La relecture a découvert un ancien chemin d’envoi qui appelait directement le fournisseur : sa tentative OAuth ne conservait pas le brouillon préparé et son historique ne conservait pas la boîte. Les relances utilisent désormais la même commande durable que les envois manuels, avec une clé propre à la relance, une identité de traitement stable et un bail renouvelé. Le contenu personnalisé est enregistré avant le transport. Une reprise ne peut modifier ni contenu, ni boîte, ni contexte financier figé ; un timeout conserve l’identité distante préparée. Une acceptation suivie d’un incident SQL répare l’historique sans nouvel envoi, même si la facture a depuis été payée.

Le solde en centimes est enregistré dès la préparation du texte, manuelle ou automatique, puis figé avec la facture dans le payload de livraison. Leur statut et leur solde sont relus avant préparation du transport et immédiatement avant dispatch fournisseur. Un paiement complet ou partiel bloque une tentative devenue obsolète, y compris avant son premier appel fournisseur. La migration ajoute un montant nullable sans inventer le solde historique : une ancienne relance non envoyée sans montant connu doit être préparée à nouveau. Une issue distante encore ambiguë suivie d’un paiement nécessite une réconciliation humaine ; le processeur ne crée pas un nouveau message à l’aveugle. Les anciennes relances FAILED/SENDING sans commande durable nécessitent également une vérification du résultat fournisseur. Une erreur préalable à toute préparation, par exemple une boîte inactive, conserve PREPARED et permet une correction sans être assimilée à une ancienne tentative ambiguë. Les relances anciennes déjà marquées SENT ne sont pas renvoyées et leur historique manquant n’est pas reconstruit par ce lot.

La recette sous rôle ACCOUNTING a aussi reproduit un refus ACL lors du premier message : le contrôle de boîte lisait une conversation encore non commitée. La conversation est maintenant validée ou enregistrée avant la transaction du message ; celle-ci conserve l’écriture atomique du message et de sa date de fil. Les contrôles de société et de boîte restent actifs. L’action finance.write peut journaliser ses relances sans obtenir les droits d’édition de campagnes ou de configuration d’automatisation. Un incident SQL peut laisser une conversation vide ; la reprise de la commande acceptée y répare l’historique sans transport supplémentaire.

Sept tests SQL couvrent le comptable et sa boîte privée, le Message-ID, la réparation après paiement, le contenu personnalisé et le brouillon repris après timeout, le refus des anciennes tentatives ambiguës, la correction d’un précontrôle, les paiements complet/partiel et le texte devenu obsolète avant le premier envoi. Les **34 tests ciblés** relances/envois/réponses/séquences/permissions/actions passent avant le dernier ajout sur le montant de préparation (6,62 s). Aucun changement d’interface ni envoi réel ; le choix d’une boîte pour les relances automatiques reste soumis au refus existant d’une sélection ambiguë.

La suite locale complète finale obtient **577 tests dans 127 fichiers** (78,31 s), dont les sept cas de relances. Types, lint ciblé et compilation de production finale passent. PostgreSQL et les parcours complets doivent encore qualifier le SHA final de ce correctif ; les résultats CI de `c602a3d` ne s’y substituent pas.

La CI achevée de `46f75b58953aa7359a2f889240a3841dd41552f8` confirme **577 tests SQLite, 576 PostgreSQL et une exclusion native SQLite**, dont les sept cas de relances, **89 E2E et 19 exclusions explicites**, et huit contrôles Linux réussis. Les 50 migrations sont appliquées ; les artefacts téléchargés portent le SHA exact et l’image testée `sha256:a855fa56bad4b429eb29064167cb3597ec5d165dee277bf9cd60a916aef6b1da`. Types, lint, compilation et couverture passent aussi sur GitHub. L’audit de production rapporte zéro vulnérabilité ; l’audit complet reste l’unique étape en échec, avec les huit alertes hautes de développement déjà identifiées. Aucun seuil n’est abaissé et aucune fusion/publication n’est effectuée. [Run push exact](https://github.com/lacombechristophe/freelio/actions/runs/37154437076). La preuve porte sur ce commit de code ; un commit ultérieur limité à cette documentation ne constitue pas une nouvelle qualification runtime.
