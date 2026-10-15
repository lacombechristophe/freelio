# Candidat a39e5a5 : résultats conservés

Les [deux workflows complets](ci-a39e5a5.json) passent types, lint, build, les 2 361 contrôles SQLite, 2 360 contrôles PostgreSQL avec une exclusion native SQLite, neuf contrôles Linux et deux audits sans vulnérabilité par job UI. Ils restent rouges : la branche termine 213 parcours desktop avec deux échecs et une exclusion ; la PR en termine 212 avec trois échecs et une exclusion. Les deux mobiles terminent 197 parcours avec un échec et 18 exclusions.

Les deux recettes de facture historique échouent sur une précondition de fixture (OVERDUE au lieu de SENT). Le parcours Campagnes a une date de fin fixe déjà atteinte. La PR signale aussi une attente de menu Supprimer non ouvert ; la cause n'est pas établie sans sa trace. Ces échecs et leurs digests ne sont pas remplacés par les corrections de recette suivantes.

GitHub refuse les rapports natifs et les traces pour quota, y compris après le [nettoyage autorisé](../20261015-ci-storage/README.md) ; le recalcul n'est pas encore constaté. Le fichier CI est une projection des comptes des reporters et des métadonnées terminales, pas une reconstruction des JSON manquants. Le reporter line ne donne pas la liste détaillée des exclusions.

L'[identité Git](source-a39e5a5.json) porte sur 1 072 entrées hors documentation du merge PR réellement testé. La [preview exacte](hosted-a39e5a5.json) passe 49 lectures par surface sans erreur JavaScript, retry ou exclusion, avec harnais et alias vérifiés après consultation. Ce résultat sur données fictives Owner ne qualifie ni les mutations, ni les fournisseurs réels, ni la charge.
