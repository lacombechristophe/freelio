# Résultats des candidats du 15 octobre

Le dernier [passage complet, 8aab95f](ci-8aab95f.json), termine dans les deux workflows : 2 398 SQLite par job UI, 2 397 PostgreSQL avec une exclusion native SQLite et neuf contrôles Linux réussis. Chaque desktop termine 215 parcours réussis, un échec et une exclusion ; chaque mobile termine 198 réussis, un échec et 18 exclusions. Le seul échec navigateur est le sélecteur `summary` du test d'archive historique, qui trouve deux éléments. `93a906e` cible explicitement « Mise en page » sans retirer d'assertion. Son résultat doit encore être confirmé en CI.

Les 37 contrôles SQL et les deux parcours compilés de la synthèse Opérations passent dans les deux workflows. Les uploads restent refusés pour quota au moment de ces runs ; le candidat n'est pas entièrement qualifié. L'[identité du code](source-8aab95f.json) compare 1 076 entrées hors documentation au merge testé. La [lecture hébergée exacte](hosted-8aab95f.json) passe 49 visites par surface sans erreur JavaScript, retry ni exclusion.

Le [passage 1d0d225](ci-1d0d225.json) reste conservé : 37 cas PostgreSQL non exécutés à cause d'un transfert de fixture utilisant le même dépôt au départ et à l'arrivée, puis navigateurs interrompus lors de la publication de la correction. Aucun résultat navigateur complet n'en est déduit. Les [preuves d'identité](source-1d0d225.json) et la [lecture hébergée](hosted-1d0d225.json) restent distinctes.

## Référence précédente : a39e5a5

Les [deux workflows complets](ci-a39e5a5.json) passent types, lint, build, les 2 361 contrôles SQLite, 2 360 contrôles PostgreSQL avec une exclusion native SQLite, neuf contrôles Linux et deux audits sans vulnérabilité par job UI. Ils restent rouges : la branche termine 213 parcours desktop avec deux échecs et une exclusion ; la PR en termine 212 avec trois échecs et une exclusion. Les deux mobiles terminent 197 parcours avec un échec et 18 exclusions.

Les deux recettes de facture historique échouent sur une précondition de fixture (OVERDUE au lieu de SENT). Le parcours Campagnes a une date de fin fixe déjà atteinte. La PR signale aussi une attente de menu Supprimer non ouvert ; la cause n'est pas établie sans sa trace. Ces échecs et leurs digests ne sont pas remplacés par les corrections de recette suivantes.

GitHub refuse les rapports natifs et les traces pour quota, y compris après le [nettoyage autorisé](../20261015-ci-storage/README.md) ; le recalcul n'est pas encore constaté. Le fichier CI est une projection des comptes des reporters et des métadonnées terminales, pas une reconstruction des JSON manquants. Le reporter line ne donne pas la liste détaillée des exclusions.

L'[identité Git](source-a39e5a5.json) porte sur 1 072 entrées hors documentation du merge PR réellement testé. La [preview exacte](hosted-a39e5a5.json) passe 49 lectures par surface sans erreur JavaScript, retry ou exclusion, avec harnais et alias vérifiés après consultation. Ce résultat sur données fictives Owner ne qualifie ni les mutations, ni les fournisseurs réels, ni la charge.
