# Nettoyage des archives CI

Le 15 octobre, le propriétaire a autorisé la suppression distante d'une liste fermée de 269 anciennes archives `playwright-report` et `ui-audit-reports`, créées avant le 14 octobre à 00:00 UTC. Les 27 282 999 474 octets avaient été sauvegardés localement et leurs SHA-256 comparés aux digests GitHub avant toute suppression.

Le script a revalidé le manifeste, les métadonnées distantes et chaque ZIP avant son DELETE. Résultat : 256 suppressions, 13 identifiants déjà absents ; les 269 ZIP locaux sont conservés. Le contrôle suivant retrouve les 750 artefacts non sélectionnés, avec les mêmes tailles et digests (13 006 478 octets). Les runs, logs et preuves SQL/Linux ne font pas partie de la sélection.

Le [reçu de vérification](verification.json) conserve les empreintes du manifeste et du reçu de suppression. Les ZIP restent hors dépôt ; les anciens liens GitHub des archives supprimées ne sont plus utilisables. Une sauvegarde locale ne restaure pas leurs identifiants distants.

Ce contrôle constate l'espace occupé par les artefacts ; il ne prouve pas le recalcul du quota de facturation. Les uploads refusés avant ce recalcul restent des échecs CI, même si leurs tests ont réussi. Aucun abonnement ni dépassement payant n'a été souscrit.
