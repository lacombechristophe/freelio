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

La suite locale atteint **499 tests réussis dans 116 fichiers** (60,34 s), dont le test de capacités désactivées. Types, lint et compilation Next 16.3.6 de production passent. La CI finale doit être renseignée depuis ses sorties ; ne pas déduire son succès des vérifications locales.

Les autres demandes d’interface non approuvées restent à soumettre : lecture des conversations (recherche, archives, pagination), rédaction avancée, campagnes/journal d’automatisation et écrans métier restants. Le lot Marketing approuvé ne comprend pas de gestion nouvelle des préférences de consentement ni de scoring santé client.
