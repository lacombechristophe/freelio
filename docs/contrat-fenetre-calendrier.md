# Fenêtre calendrier et génération de connexion

CAL-01 exige une progression réelle du périmètre importé, en plus de la pagination. Le 20 octobre, six tests SQL/HTTP simulé reproduisent deux défauts sur Google et Microsoft : la fenêtre associée au checkpoint n'est pas conservée, et une réponse de l'ancienne connexion peut importer une tâche ou remplacer le curseur après reconnexion. Ce contrat prépare la correction ; les résultats ciblés ne clôturent pas la qualification globale.

## Périmètre et continuité

Le calendrier principal couvre au moins les 90 jours passés et l'année à venir. Les bornes sont calculées en UTC, conservées pendant toute la pagination et associées au checkpoint final. Une marge jusqu'au début du mois suivant évite de reconstruire la collection chaque jour. Quand la fenêtre ne couvre plus le périmètre courant, une nouvelle vue complète et paginée est construite ; la simple réutilisation d'un vieux delta ne prouve pas que des événements auparavant hors fenêtre sont découverts.

La fenêtre finale reste avec le curseur dans les credentials chiffrés. Une ancienne connexion dont le curseur ne possède aucune fenêtre connue recommence une vue complète ; aucune borne actuelle n'est attribuée rétroactivement à ce token. Les anciennes copies restent conservées. Une reprise partielle termine la fenêtre capturée avant de préparer la suivante ; un travail achevé sur une fenêtre déjà périmée reste « à poursuivre ».

Les réponses 410 demandent un nouveau parcours initial, avec conservation des tâches locales. Un refus 403, un quota 429 ou une panne ne prouvent pas une annulation distante. Une page échouée garde sa continuation antérieure et ses copies rejouables. Le checkpoint final, sa fenêtre et la fin de la progression partielle doivent être enregistrés ensemble, en préservant les nouveaux jetons et les changements de configuration concurrents.

Références : [synchronisation Google Calendar](https://developers.google.com/workspace/calendar/api/guides/sync), [paramètres de liste Google](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [delta d'une vue Microsoft](https://learn.microsoft.com/en-us/graph/delta-query-events). Ces protocoles ne constituent pas une disponibilité/free-busy, une invitation ou une qualification de compte réel.

## Reconnexion

La génération de connexion est capturée avant lecture des credentials. Chaque réponse, page et écriture du checkpoint doit encore appartenir à cette génération, à une connexion active autorisant le calendrier et au bail courant. L'ancienne réponse ne doit ni importer dans la nouvelle connexion, ni y enregistrer un curseur ou une erreur. La rotation légitime du jeton dans une même génération conserve le checkpoint et la fenêtre les plus récents.

L'import de chaque page utilise une transaction qui verrouille la ligne de connexion après vérification de sa génération. Les requêtes demandent 50 événements ; un appel traite au plus quatre pages et chaque transaction possède un budget de 30 secondes. Une reconnexion qui gagne avant ce verrou refuse la page ; une reconnexion suivante attend sa fin. Cette sérialisation et les intercalages SQL testés ne constituent pas une mesure de charge PostgreSQL.

## Qualification attendue et limites

Les contrôles SQL avec HTTP simulé couvrent changement de mois, événement inchangé auparavant hors fenêtre, reprise interrompue, expiration, panne, reconnexion, rotation et continuation Microsoft hors ressource. Les résultats complets, types, lints, build et identité de source doivent être associés au commit ; PostgreSQL et comptes fournisseurs restent distincts.

Ce lot ne règle pas les invitations, les récurrences avancées, les conflits d'édition entre tâche locale et fournisseur, ni les événements anciens hors de la fenêtre suivie. Il n'efface ni ne réaffecte les historiques et ne déclenche aucun appel fournisseur réel pendant sa recette.
