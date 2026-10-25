# Historique et choix de chantier Temps

Le [contrat approuvé](../../contrat-temps-listes-completes.md) répond aux deux plafonds constatés dans le [diagnostic précédent](../20261012-time-entry-integrity/before.json) : 20 chantiers et 500 temps. Les mutations sont qualifiées séparément dans le lot d'intégrité ; leurs tests restent exécutés avec ce lecteur.

`time-directory.integration.test.ts` couvre 26 cas sur SQL réel : entrée ancienne au-delà de 500, pagination stable, 101 choix de chantier, projection minimale, huit rôles, société du client, révocation d'agence, recherche et export cohérents, fuseaux et passage à l'heure d'été. Le CSV traverse 1 001 lignes en deux requêtes bornées dans une même transaction de lecture. Son texte final est conservé en mémoire ; cette recette n'est pas une mesure de charge pour des exports massifs. Une erreur annule l'export complet, sans téléchargement partiel.

Six E2E ordinateur/mobile sont définis dans `time-directory.spec.ts` : navigation et téléchargement de 501 lignes, filtre ancien, sélection indépendante hors page et conservation du formulaire/chronomètre après une panne de lecteur. Le navigateur utilise Los Angeles et la société Paris. Les huit E2E d'intégrité sont conservés ; l'attente du premier choix de saisie manuelle a été adaptée au nouveau chargement serveur.

La première exécution ciblée a trouvé une erreur du test : `vi.spyOn` ne pouvait observer `$transaction` sur le proxy paresseux Prisma. Un proxy d'observation transmet maintenant la vraie transaction et compte ses ouvertures ; il ne remplace aucun résultat SQL. Les 72 cas des deux lots passent ensuite localement, sans exclusion.

Le lecteur historique `getTimeEntries` reste disponible pour ses consommateurs antérieurs. La page Temps utilise le nouveau lecteur complet ; Chantiers, Organisation et la facturation concurrente restent des parcours distincts. Aucun service fournisseur ni stockage distant n'est appelé par cette recette.
