# Organisation : imputation du temps depuis une tâche

Six cas SQL diagnostiques reproduisent trois écritures incohérentes/partielles, une facture de temps périmée et une double imputation ; le dernier parcours contrôle le cas cohérent. Authentification/cache sont simulés, les actions et écritures sont réelles. Ces réussites constatent les défauts, elles ne qualifient pas une correction.

## Lot approuvé le 12 octobre 2026

- Exiger Opérations en écriture avant les lectures métier ; valider durée entière de 1 à 1 440 minutes et les références de société, client et agences.
- Temps créé, tâche terminée et budget recalculé dans une seule transaction. Tout refus ou incident conserve l'état antérieur ; aucun fournisseur ni calendrier distant n'est appelé.
- Pour les nouvelles imputations, conserver une référence unique à la tâche afin qu'un double clic ou une répétition ne produise pas un second temps. Afficher « Cette tâche a déjà été imputée » dans la notification actuelle. Les anciens temps sans association ne sont pas rattachés par ressemblance de titre ou date.
- Refuser une tâche reliée à un chantier/client inaccessible avec « Tâche introuvable ou chantier inaccessible ». Les références et données incohérentes ne sont pas supprimées automatiquement.
- Retour contrôlé des refus attendus, afin que le navigateur compilé conserve l'état et explique le refus. Boutons, champs, couleurs et disposition conservés.

Le calendrier, les récurrences et l'avancement des séquences après clôture d'une tâche restent des parcours distincts ; leur comportement n'est pas changé par ce lot. Les associations historiques manquantes et les reprises après arrêt brutal ne sont pas devinées.

La tâche conserve aussi la date de son imputation : la suppression ultérieure du temps ne remet pas ce droit à zéro. La suppression de la tâche conserve le temps, avec une association devenue indisponible. La migration est additive et laisse les nouvelles références historiques à NULL.
