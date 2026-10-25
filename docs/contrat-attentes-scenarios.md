# Scénarios : attente durable et journal par action — contrat approuvé

Date : 7 octobre 2026. Sous-lot AUTO-05 explicitement approuvé par le propriétaire : « Oui, appliquer ce lot Scénarios ». Implémentation en recette isolée ; la qualification CI de son SHA reste requise avant livraison.

## Constat initial vérifié

Le moteur persiste déjà événements, versions de scénario, entrées figées, checkpoints par action, bail propriétaire et reprise. CREATE_TASK.delayHours définit l’échéance d’une tâche créée immédiatement ; ce champ n’attend pas avant l’action suivante. Il n’existe pas d’action WAIT. Le journal d’interface montre le résultat global des dernières exécutions, sans parcours paginé de toutes les exécutions ni détail de leurs checkpoints. Les versions/configurations historiques manquantes ne doivent pas être reconstituées arbitrairement.

## Lot visible approuvé

- Ajouter « Attendre » aux actions du constructeur, y compris dans une branche, avec durée entière de 1 à 8 760 heures. Le délai d’échéance des tâches conserve son sens actuel.
- Afficher l’état « En attente » et sa date de reprise. Une pause du scénario conserve l’attente ; après réactivation, la suite ne devient éligible qu’à l’échéance atteinte. Les passages du processeur déterminent l’heure effective de reprise.
- Dans le journal des scénarios, ajouter recherche, filtre d’état et pagination de 25 exécutions, puis « Détails » pour consulter les actions ordonnées, leurs états/dates et un résultat limité. Ne pas exposer le JSON d’entrée, les secrets ou le corps d’un message.
- Pour une ancienne exécution sans preuve détaillée, afficher cette indisponibilité sans inventer d’actions réalisées. Conserver styles/couleurs et interdiction des écritures en démo publique.

## Contrat technique

Une attente doit être enregistrée en SQL avec son échéance et sa position, sans garder une requête ou un worker endormi. Échéance, état et checkpoint partagent une transaction. Avant l’échéance, aucun effet suivant ; après interruption/redémarrage, reprendre la même attente sans recalculer son début ni répéter les actions terminées. Une attente ne consomme pas le budget de reprises d’erreurs et ne transforme pas l’outbox en dead letter. Le prochain réveil respecte les attentes en cours des autres scénarios du même événement.

Les effets restent sous contrôle société, version figée, scénario actif, propriétaire et CAS. Une pause/archive observée bloque la suite ; une acceptation déjà engagée conserve sa trace. La prospection conserve ses preuves actuelles et la reprise des envois automatiques incertains reste un lot distinct. Aucun nouveau fournisseur, webhook, compte réel ou envoi réseau n’est ajouté.

Le détail d’action présente la preuve persistée, avec distinction attente/terminée/échec et absence historique. Il ne déduit pas la réussite d’une action depuis le seul curseur global. Les erreurs sont limitées et les refus attendus structurés. Les lectures de journal utilisent le périmètre complet de la société et un ordre stable.

## Recette requise

SQLite et PostgreSQL : délai positif borné, deux attentes successives/branches, redémarrage avant/après échéance, panne entre effet/checkpoint, deux workers, effet antérieur conservé, pause/réactivation/archive, sociétés étrangères et démo sans écriture. Attente longue sans incrément artificiel du compteur d’erreurs ; plusieurs scénarios d’un événement sans affamer les autres. Horloge contrôlée dans les tests plutôt qu’attente réelle.

Volumes : au moins 101 exécutions, dernière ligne accessible, recherche/filtre et pagination cohérents, détail limité aux checkpoints autorisés. E2E ordinateur/mobile : créer/simuler l’attente, voir sa date, ouvrir le détail et changer de page. Typage/lint/build, CI liée au SHA ; aucune qualification fournisseur ou SIGKILL réel déduite de mocks.


## Implémentation et compatibilité

La migration additive 59, 20261007010000_workflow_waits, ajoute wakeAt et un compteur failures aux exécutions, puis états/début/échéance/code d’erreur aux checkpoints. completedAt devient nullable pour une attente ou un échec. Les anciens checkpoints restent COMPLETED : ils étaient créés seulement après effet réussi ; aucune date de début n’est inventée. Aucune migration publiée n’est réécrite ni exécutée sur l’instance originale.

Le moteur persiste la même échéance à chaque passage ; il libère son bail et revient à l’ordonnanceur. Les erreurs réelles seules consomment les cinq reprises. Un scénario épuisé n’abandonne pas l’attente d’un autre scénario : l’événement reste à traiter tant qu’une exécution est vivante, avec la plus proche échéance disponible. Les branches utilisent l’entrée et la version figées. Une pause conserve l’échéance ; l’archivage classe les checkpoints d’attente sans exécuter la suite.

Le constructeur propose une attente simple et une action suivante facultative, ou une attente dans une branche. Les queues d’actions existantes sont conservées lors de l’édition. Le journal interroge toute la société par pages de 25, avec ordre stable, recherche et filtre d’état ; ses détails ne retournent ni entrée/configuration brute ni corps/secret fournisseur. Au-delà des 50 actions autorisées, un historique incohérent est signalé plutôt que tronqué silencieusement. Un checkpoint d’échec ne prouve pas qu’un effet externe n’a jamais eu lieu.

## Preuves et limites de recette

Sept nouveaux tests SQL couvrent bornes/branches, deux attentes successives, appels répétés avant échéance, concurrence, panne au checkpoint avec rollback, conservation des effets antérieurs, pause/réactivation/archive, attente longue et frère épuisé, journal de 101 lignes, société étrangère et démo publique. L’horloge Date est contrôlée ; aucune heure réelle n’est attendue. Le rejeu lit les états SQL persistés, sans prétendre injecter un SIGKILL.

Deux parcours navigateur ordinateur/mobile sont préparés : création/simulation/publication, attente et détail, reprise à l’échéance puis action attestée, cinquième page/recherche du dernier historique et indisponibilité explicite des anciens détails. Un enfant CI SQL isolé avance uniquement sa propre horloge ; aucun transport ni serveur supplémentaire n’est lancé. Leur découverte ne vaut pas exécution réussie. PostgreSQL et les parcours navigateur doivent encore obtenir leur preuve CI propre.

La reprise humaine des envois automatiques incertains, la qualification de comptes OAuth réels, une mesure de latence en hébergement et la rétention/purge des journaux restent distinctes. Ce sous-lot ne ferme pas l’ensemble AUTO-05/L8/L9.
