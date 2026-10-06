# Campagnes : édition, vérification et activation durable — proposition

Date : 6 octobre 2026. État : premier lot visible approuvé (édition/listes/sélecteurs), puis recherche/pagination des séquences rattachées approuvées séparément. Capture et activation durable proposées, non encore approuvées. Référence de lecture : branche de complétude, candidat b1e130b. Aucun connecteur, envoi ou activation réelle effectué pour cette préparation.

## Défauts à fermer

L’interface crée campagne et livrable mais ne modifie pas leurs champs ; elle affiche des sous-ensembles bornés (200 campagnes/segments, 500 séquences/responsables, 100 ressources/séquences par campagne). Ses indicateurs additionnent ce sous-ensemble. L’activation lit 5 000 membres et refuse explicitement un segment plus grand, puis inscrit par transactions de 200 sans commande ni rapport durable commun. Un échec intermédiaire ne dit pas quelles lignes ont été effectivement inscrites. Le consentement se fonde encore sur un booléen : il ne constitue pas la preuve liée à l’adresse déjà requise pour la prospection manuelle.

Le socle de pause/date et d’expéditeur fixé existe et reste obligatoire. Les inscriptions dédupliquées ne doivent jamais repartir de zéro. Les ressources SMS/social/Ads restent des éléments de coordination ; leur statut Publié ne signifie pas une diffusion par Freelio.

## Premier sous-lot proposé : édition et listes complètes

Ajouter Modifier à chaque campagne et livrable. Réutiliser les champs existants de campagne (nom, objectif, canaux, segment, responsable, période, budget, UTM, notes) ; pour le livrable : nom, type, responsable, échéance et URL HTTP(S). Afficher Annuler et Enregistrer dans les formulaires, avec conflit explicite si la version a changé. Conserver tous les champs et historiques existants.

Nom et objectif restent éditables. Une audience ou séquence déjà engagée ne doit pas être déplacée silencieusement : verrouiller segment, rattachement et boîte dès la première inscription ; prévoir une nouvelle campagne pour une autre audience. Modifier des dates ou le statut reconfigure les contrôles d’exécution futurs ; aucune acceptation déjà obtenue n’est annulée. Une campagne terminée/archivée ne redémarre pas par une simple édition. Une boîte déconnectée bloque les prochains envois et ne change pas d’identité.

Recherche et pagination serveur par 25 campagnes/livrables/séquences rattachées ; sélecteurs recherchables/paginés pour segments, séquences et responsables. Indicateurs agrégés sur le périmètre complet, avec filtres explicités ; aucune somme du seul écran chargé. Isolement société, membres actifs, ressources appartenant à la campagne, droits automation.read/write, validation du statut et compare-and-set sur updatedAt/version. Erreurs attendues structurées dans les Server Actions. Actions interdites en démo publique côté serveur et interface.

Accord visible obtenu pour ces champs/commandes, puis pour la pagination de la liste de séquences rattachées. Pas de changement de couleurs, de styles ou de disposition générale. Ce premier sous-lot ne remplace pas encore le protocole d’activation existant par un lancement asynchrone.

## Sous-lot suivant : vérification et capture d’audience

Un bouton Vérifier l’audience prépare une capture durable, paginée, avec totaux d’éligibilité et motifs d’exclusion. Prendre l’audience complète par lots à ordre stable, sans plafond total de 5 000 ni chargement intégral en mémoire. Capturer identité de campagne, segment/génération, séquence/version/étapes, expéditeur, cadence et dates ; inscrire chaque candidat dans la capture avec identité/adresse/preuve et décision. La capture n’envoie rien et n’inscrit personne.

La construction doit provenir d’un ensemble cohérent (génération publiée du segment ou lecture transactionnelle versionnée des membres). Une modification concurrente invalide la capture ; ne pas prétendre à un instantané si une simple borne de date mélange plusieurs générations. Pour une liste statique, les adhésions doivent être versionnées/verrouillées pour la capture. Préserver l’ancienne capture valide en cas d’interruption de construction.

La prospection requiert une preuve active de la société liée au contact et à l’adresse exacte, comme pour le mode manuel ; un booléen ancien ne devient pas une preuve. Si un prospect n’a pas de contact/preuve reliables, l’exclure avec motif explicite. Lier la preuve et le retrait personnel à chaque nouvelle commande d’envoi de séquence ; préserver les historiques non classés. Ce comportement concerne aussi les séquences hors campagne et demande qualification séparée des relances de service.

## Activation et reprise

Après présentation de la capture, confirmer Inscrire l’audience vérifiée. Persister une commande idempotente contenant la capture/version et l’auteur avant travail. Un processeur propriétaire unique inscrit des lots bornés : inscription et checkpoint partagent une transaction, avec compteur des lignes réellement créées et des lignes déjà inscrites. Aucun reset d’une inscription existante. Deux clics ou deux workers ne créent ni commande concurrente ni doublon.

État explicite : préparation, prête, inscription en cours, pause, terminée, échec à reprendre, annulée avant poursuite. Reprendre traite la même capture et son premier lot incomplet ; il n’ajoute aucun nouveau membre du segment actuel. Une nouvelle audience exige une nouvelle vérification. Le retrait, l’adresse changée, la suppression et les droits/états sont relus à l’inscription puis immédiatement avant dispatch ; conserver capture et motifs de refus sans leur attribuer une validité actuelle.

Une pause ou fin de campagne interrompt de nouvelles inscriptions/envois après observation de cet état ; les acceptations engagées restent connues. Le classement des résultats inconnus d’envois automatiques reste un lot de reprise distinct, sans renvoi aveugle. Rapport d’activation paginé et audité, disponible après reconnexion ; aucune erreur partielle transformée en succès total.

## Recette exigée

- SQLite et PostgreSQL : deux sociétés, droits retirés, conflit d’édition, références étrangères, dates invalides, URL non HTTP(S), public demo sans écritures.
- 201 campagnes et 101 ressources, sélecteurs au-delà des anciennes bornes : dernière ligne trouvable, compte et agrégats exacts.
- 5 001 et 10 001 membres : capture complète et cohérente ; exclusion expliquée, aucun membre ajouté après capture.
- Crash/reprise à chaque frontière lot/checkpoint ; double activation et deux workers : compte exact, inscriptions uniques, progression jamais réinitialisée.
- Pause/retrait/changement d’adresse ou de boîte entre capture, inscription, préparation et dispatch : aucun nouvel envoi interdit ; preuve historique et résultat distant conservés.
- E2E ordinateur/mobile : édition, conflit, recherche/pagination, rapport et reprise explicite après reconnexion ; styles conservés et aucune nouvelle exclusion de viewport.

Les fournisseurs réels et la délivrabilité ne sont pas déduits des réponses HTTP fictives. Aucun coût, abonnement ou déploiement dans ce contrat.
