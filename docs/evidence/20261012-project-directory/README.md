# Portefeuille Chantiers complet

Le [contrat approuvé](../../contrat-chantiers-listes-completes.md) répond au plafond de 20 éléments reproduit dans le [diagnostic Temps/Chantiers](../20261012-time-entry-integrity/before.json). La nouvelle page interroge tout le périmètre accessible avec une projection minimale ; le lecteur historique est conservé pour ses autres consommateurs.

`project-directory.integration.test.ts` couvre 23 cas SQL : 101 chantiers en cinq pages, tri stable, recherche sur quatre champs, filtres complets, huit rôles, révocation et références étrangères. Les budgets opérationnels et les dates civiles gardent leur sens. Les caches financiers et scores Client ne sont pas sélectionnés.

Les [deux échecs de la première version du nouveau lecteur](relations-before.json) concernent une agence et un modèle d'une autre société. Cette version était en préparation et ne constitue pas une baseline publiée. Le lecteur exclut maintenant ces références incohérentes, y compris pour Owner ; le détail et les mutations restent séparés. Les données fictives et leurs rattachements ne sont pas supprimés par les refus.

Six E2E sont définis dans `project-directory.spec.ts` : navigation jusqu'au chantier ancien, recherche et filtre Terminé, formulaire ouvert pendant une panne d'une recherche déjà lancée, puis édition d'un ancien chantier avec contrôle des valeurs persistées. Le navigateur et la SQLite isolée vérifient ensemble la sauvegarde ; aucune route de diagnostic n'est ajoutée au produit. Un chargement `--list` ne vaut pas exécution.

Les sélecteurs Client/Modèle, la charge hébergée, la révocation pendant une requête déjà autorisée et les autres lecteurs Chantiers restent distincts. Le diagnostic ne qualifie ni concurrence ni fournisseur.
