# Rotation des synchronisations de messagerie

Le diagnostic OPS-03 reproduit une sélection bloquée sur les premières boîtes : le dernier succès mail ne progresse ni pour une connexion calendrier seul ni après un échec. Trois lots de deux n'atteignent que deux connexions sur six. Les [deux échecs initiaux](evidence/20261020-sync-fairness/baseline.json) restent conservés.

## Ordre de passage

Le planificateur utilise un curseur persistant distinct de `lastSyncAt`. Ce curseur représente un ordre de passage, pas l'heure réelle d'un appel ni une preuve de réussite. Les anciennes valeurs restent nulles. Le tri place explicitement ces valeurs en premier, puis ordonne par curseur et identifiant stable, sur SQLite comme sur PostgreSQL.

Chaque réservation de passage avance le curseur au-delà du maximum courant avant d'appeler les traitements. Une horloge figée ou reculée ne bloque donc pas la rotation. La réservation compare aussi l'ancien curseur, la société, le fournisseur, l'activité et les capacités ; une sélection déjà traitée ou désactivée n'est pas exécutée. Les connexions sans capacité active et les fournisseurs hors OAuth sont exclus.

Les échecs, résultats partiels et interruptions laissent le passage réservé. Les autres boîtes peuvent alors progresser au prochain lot. Pour un ensemble fini et stable de connexions éligibles, chaque passage remet la connexion après les autres ; le nombre de connexions effectivement examinées est limité à 25 par appel. Ce mécanisme ne définit pas de quota fournisseur ni de priorité commerciale entre sociétés.

## Verrou et durée

L'API et le worker transmettent le contrôle de leur verrou commun. Sa propriété est revérifiée avant les réservations et après les traitements ; sa perte arrête la suite du lot. Les verrous propres aux traitements mail et calendrier restent appliqués. Aucune nouvelle connexion ne démarre après 180 secondes de lot, pour laisser une marge au traitement courant dans le job HTTP de 300 secondes. Ce budget ne prétend pas interrompre instantanément un appel déjà engagé.

La synchronisation manuelle garde son parcours explicite. Les dates de succès mail, états de capacité et checkpoints ne sont pas réinterprétés. L'ancien planificateur mail sans appelant est retiré ; les deux points d'entrée automatiques utilisent le même planificateur.

Un bilan comportant des échecs renvoie HTTP 503 avec ses compteurs conservés, afin que le cron utilisant `curl --fail-with-body` ne présente pas un succès. Un lot réussi ou un verrou déjà occupé reste en HTTP 200 ; un appel sans secret valide reste refusé avant traitement.

## Qualification

Les tests vérifient rotation, sociétés distinctes, échecs, continuation, horloge figée/reculée, sélection périmée, perte de verrou, durée et limite de lot. Deux parcours supplémentaires conservent les vrais traitements SQL et cryptographiques avec HTTP Google/Graph simulé. `node scripts/verify-sync-attempt-upgrade.mjs` vérifie une base historique fictive, l'index SQLite et le diff PostgreSQL. L'exécution PostgreSQL réelle, les fournisseurs réels, la charge et les quotas restent des qualifications distinctes.
