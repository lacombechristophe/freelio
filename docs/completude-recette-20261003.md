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

La lecture parcourt tous les clients par curseur de 200, calcule leurs signaux sans échantillonner l’historique, puis priorise et filtre le portefeuille entier. Seuls les profils de la page de 25 clients atteignent le navigateur. Les compteurs couvrent le portefeuille entier indépendamment du filtre ; les requêtes conservent le périmètre société/agence de l’acteur. L’ordre inclut un identifiant de départage et une page hors limites revient à la dernière page disponible.

Les tickets fusionnés sont exclus ; les factures brouillon, annulées, payées, avoirs et échéances futures ne deviennent pas des impayés. Le solde est plafonné à zéro par facture, pour qu’un trop-perçu ne masque pas une autre dette. Les réponses de satisfaction sont pondérées par leur nombre et normalisées selon l’échelle de chaque enquête. La date de renouvellement explicite prime sur le premier terme daté d’un contrat actif, même après plus de 100 contrats sans terme.

« Figer les scores » parcourt également tous les clients. Un bail interdit les recalculs concurrents ; scores, snapshots et événements durables partagent une transaction sérialisable. Une panne après le premier lot annule l’ensemble. Le snapshot quotidien utilise la date du dernier relevé, indépendamment d’un recalcul plus récent. Le recalcul persistant global exige un administrateur ayant accès à toute la société ; un acteur limité à ses agences ne peut pas enregistrer des scores globaux à partir de ses seuls signaux.

`customer-success.integration.test.ts` couvre 1 001 clients, 501 tickets/factures, 101 contrats et 102 réponses sur deux échelles, une autre société, les signaux limités à une agence, le recalcul répété, le relevé quotidien, la concurrence et un rollback au 201e événement. La suite locale finale obtient **521 tests réussis dans 120 fichiers** (74,81 s) ; types, lint et compilation de production passent. Le parcours SAV existant est étendu à la saisie rapide, au filtre, au retour depuis une fiche et au portefeuille complet : **2 E2E réussis sur ordinateur/mobile** (9,2 s). La CI du nouveau candidat reste à confirmer ; les preuves de `a530980` ne s’y substituent pas.

### Borne de programmation des campagnes

La suite complète a reproduit un arrondi de minute qui pouvait programmer une étape quelques secondes avant son départ ou son délai. La date est désormais arrondie vers la minute suivante, puis validée contre la fenêtre d’envoi. Deux cas déterministes reproduisent l’avance et la limite de fermeture ; les 17 tests ciblés calendrier de séquence/campagne passent après correction. Cette correction serveur ne modifie aucune commande visible.
