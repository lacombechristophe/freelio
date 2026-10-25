# Identité des conversations Gmail et Outlook

Le diagnostic MAIL-05 conserve deux échecs SQL : deux conversations distinctes, du même contact et au même objet, sont regroupées. Le rapprochement doit utiliser l'identité fournie par la messagerie : `threadId` chez Gmail, `conversationId` chez Microsoft. Cette identité est opaque, validée et limitée à une société et une boîte ; elle ne constitue jamais une autorisation d'accès.

## Comportement attendu

- Un identifiant natif connu retrouve le même fil, même si l'objet ou les participants changent. Un autre identifiant crée un autre fil. Une contrainte SQL évite les doublons de création concurrente.
- Le premier envoi conserve cet identifiant avec sa commande, depuis la préparation jusqu'à l'acceptation. Les réparations manuelles et de séquence le réutilisent sans nouvel envoi. Une réponse fige aussi l'identité du parent et vérifie les métadonnées distantes avant de créer un brouillon.
- L'identifiant ne figure pas dans les projections de la boîte de réception. Les droits de société, de boîte privée/partagée et les droits d'écriture continuent de s'appliquer.
- En l'absence d'identité native, un nouvel échange OAuth n'est pas regroupé par son seul contact et objet. Une référence exacte de réponse ou un fil explicitement choisi conserve son sens ; ce cas ne prouve pas une identité fournisseur.

## Historiques

La migration ajoute deux colonnes nullables et une contrainte. Elle ne rapproche, ne sépare et ne déplace aucun ancien message. Les anciens fils, éventuellement mélangés, restent sans identité connue. Leur réobservation conserve leur affectation et leur contenu ; elle ne leur attribue pas la première identité rencontrée. Une nouvelle réponse identifiée peut donc ouvrir un nouveau fil à côté du dossier historique.

Une référence de message déjà associée à un autre fil natif ne peut pas être réaffectée par synchronisation ou réparation. Une réparation peut adopter une copie sortante exacte dans la même boîte ; elle conserve son fil historique lorsqu'il est inconnu. Les acceptations déjà persistées restent des acceptations, même si l'écriture du journal échoue.

## Qualification

La [reproduction initiale](evidence/20261020-native-conversations/README.md) reste conservée. Les tests couvrent séparation et regroupement natifs, objets modifiés, archives locales, sociétés/boîtes distinctes, concurrence SQL, identifiants invalides, réobservation, préparation/reprise d'envoi, réponses et réparations. `node scripts/verify-native-conversation-upgrade.mjs` vérifie une base fictive remplie et compare le SQL PostgreSQL sans connexion externe. Les appels HTTP simulés ne qualifient pas des comptes Google/Microsoft réels.

Références : [message Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [message Microsoft](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0).
