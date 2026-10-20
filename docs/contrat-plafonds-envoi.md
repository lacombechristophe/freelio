# Plafonds internes d’envoi

Les plafonds sont des limites choisies par l’administrateur de Freelio, par
société et boîte. Ils ne représentent ni le quota disponible chez un fournisseur,
ni une garantie de délivrabilité ou de gratuité. Le relais `platform` est limité
par société ; plusieurs sociétés peuvent partager un même compte fournisseur.

Une configuration explicite est nécessaire pour autoriser un nouvel envoi.
L’absence de configuration, sa désactivation ou un message plus grand que son
plafond bloque l’admission. Aucun quota fournisseur n’est inventé. Les limites
sont exprimées en destinataires distincts, y compris CC et CCI, par minute et par
jour civil UTC. Les valeurs autorisées (1 à 1 000 000, minute ≤ jour) sont une
borne technique du formulaire, pas une recommandation de volume.

La réservation utilise une commande EmailDelivery persistée, en cours d’envoi,
de la même société et de la même boîte. Une transaction réserve les deux périodes
ou aucune. Deux envois simultanés ne peuvent pas dépenser le même solde. Une
commande identique ne consomme qu’une fois par période ; une reprise dans une
nouvelle période doit aussi réserver cette période. La liaison inclut le contenu
et l’enveloppe par empreinte, sans exposer les CCI dans les compteurs.

Les admissions restent consommées après une réponse inconnue, un refus distant
ou un arrêt après réservation. Il n’y a pas de remboursement automatique : une
absence de confirmation ne prouve pas une absence d’envoi. Modifier les limites
ne réinitialise aucun compteur. Le changement de période ne remonte jamais le
temps si l’horloge recule. Le journal d’admission permet de reconstruire un état
manquant ; aucun envoi historique n’est rétroactivement déclaré réservé.

Une vérification de résultat et la réparation de l’historique d’un envoi déjà
accepté ne doivent pas nécessiter une nouvelle admission. Les opérations de
lecture du fournisseur et de renouvellement OAuth peuvent précéder le contrôle.
La réservation est placée immédiatement avant la commande distante d’envoi ; les
préparations de brouillon ne constituent pas des envois.

La qualification doit distinguer moteur SQL, raccordement des trois transports,
attentes des processeurs, annulation, configuration d’administration, préflight
et tests sur un compte fournisseur réel. Un moteur qualifié seul ne signifie pas
que les envois de l’application sont déjà plafonnés.

## Raccordement et reprise

Les trois transports CRM réservent juste avant la commande distante d’envoi.
Les lectures de messages déjà acceptés passent avant ce contrôle. Une attente de
plafond restaure le compteur de tentatives et ses dates antérieures ; elle ne
transforme pas un ancien résultat inconnu en absence d’envoi. Les séquences
restent actives avec une prochaine tentative à la fin de la période, ou dans cinq
minutes si la configuration doit être corrigée. Les brouillons programmés passent
en `WAITING_QUOTA`, sans épuiser leurs cinq tentatives de transport.

Une programmation n’ayant aucune tentative, date de première tentative,
acceptation ou admission peut être annulée. La commande est conservée en
`CANCELED`, puis le brouillon reçoit une nouvelle clé. Une admission ou ancienne
tentative incertaine bloque cette libération. La fermeture de commande et la
libération du brouillon sont atomiques sous le verrou du brouillon.

Les plafonds sont édités par les administrateurs dans Communications, avec une
version de configuration pour refuser un écrasement concurrent. Les autres
membres ne voient que les agrégats des boîtes auxquelles ils ont accès. Aucune
écriture n’est possible dans la démo publique.

## Mise à niveau

Appliquer la migration avant de relancer les workers. Les anciennes boîtes n’ont
pas de plafond activé automatiquement : leurs nouveaux envois attendent une
configuration explicite dans Communications → Intégrations. Vérifier les limites
du compte fournisseur, définir les limites internes, puis reprendre les workers.
Les liens magiques d’authentification utilisent leur transport distinct et ne
sont pas inclus dans les plafonds CRM. Les contrôles de contenu des campagnes ne
prétendent toujours pas vérifier un domaine ou un quota fournisseur réel.
