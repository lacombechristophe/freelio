# Guide d’une revue technique de Freelio

Freelio est un projet personnel de démonstration construit par Christophe Lacombe pour montrer sa capacité à développer une application métier et à contribuer aux projets d’une agence. Les dossiers, personnes et pièces de démonstration sont fictifs. Aucun client payant, gain financier mesuré ou certification n’est revendiqué.

## Présentation en cinq minutes

Présenter le problème : une intervention doit conserver son lien avec le client, le devis, les équipements et les pièces, tandis que les documents financiers gardent un historique stable. Montrer un dossier cohérent plutôt qu’énumérer tous les modules.

Dans le profil de démo en lecture seule, consulter un client, son devis et un PDF ; expliquer que les dossiers sont figés et les sorties fournisseurs désactivées. Une [livraison hébergée](livraison-demo-vercel-20261003.md) possède sa qualification datée et sa référence de code : vérifier le déploiement actif avant présentation. Les compléments de la [PR #8](https://github.com/lacombechristophe/freelio/pull/8) restent un candidat distinct, non fusionné ; ils ne doivent pas être présentés comme déjà déployés. Montrer ensuite un équipement, son ticket SAV et son intervention. La création, l’émission et l’import se démontrent dans une copie privée modifiable avec données fictives, ou à partir de traces de recette dont la portée est annoncée.

Terminer par une preuve technique concrète : l’archive d’une facture persiste après modification de l’identité du client, un ID appartenant à une autre entreprise est refusé, ou une restauration recrée base et pièces dans une cible neuve. Ne pas confondre consultation publique et simulation d’un envoi réel.

## Lecture technique en quinze minutes

1. Lire le [README](../README.md), la [recette récente de complétude](completude-recette-20261003.md) et le [suivi du socle](execution-cto-20261001.md) pour distinguer code livré, candidat testé et fonctions ouvertes.
2. Examiner les [décisions](decisions-techniques.md) : conserver la stack, PostgreSQL partagé, limites de l’authentification et du rendu PDF.
3. Suivre une mutation : action → permission → contexte d’entreprise/agence → transaction → audit. Lire `src/lib/auth-wrapper.ts`, `src/lib/prisma.ts` et un cas métier ciblé. Les régressions du [contexte des requêtes différées](qualification-contexte-auth-20261008.md) et de [Suivi client](qualification-suivi-client-droits-20261008.md) montrent un refus SQL précis et une sauvegarde opérationnelle qui préserve un montant inaccessible ; leurs résultats sont liés au candidat, pas à la démo déjà livrée.
4. Examiner le calcul commercial, la numérotation et `src/lib/finance/issued-invoice.ts` ; retrouver leurs régressions dans la [carte des preuves](carte-des-preuves.md).
5. Lire une migration SQL, les scripts de récupération et les limites d’exploitation. Relier l’exécution au code testé, puis demander une modification limitée dans une base fictive.

## Points à savoir défendre

**Pourquoi cette stack ?** Elle permet des écrans métier, des règles serveur et des transactions locales dans un seul dépôt. Le worker existe pour des durées différentes. Un nouveau framework ou des microservices doivent répondre à un besoin mesuré.

**Comment empêcher une fuite entre entreprises ?** Les permissions encadrent les cas d’usage, le DAL ajoute des scopes tenant et agence et valide les relations écrites. Les tâches hors requête exigent un périmètre explicite. Cette approche nécessite de vérifier les nouvelles entrées et le SQL brut ; elle ne constitue pas une politique RLS générale.

**Pourquoi conserver un document émis ?** Un PDF recalculé depuis les données courantes pourrait changer après émission. L’archive garde le rendu, le XML et les données figées, avec une empreinte vérifiable. Cette mesure d’intégrité ne certifie pas à elle seule tout le système de facturation.

**Comment montrer que le document signé était celui présenté ?** Dans le candidat, chaque nouveau lien de contrat capture les variables, identités et ressources. Le serveur compare l’empreinte présentée, la révision et les champs source, puis conserve la capture signée. Montrer le test d’un onglet périmé après édition, la reprise du PDF après échec et sa stabilité au rejeu. Un historique sans capture affiche son indisponibilité ; une copie actuelle de devis ne se présente pas comme un original archivé. Voir le [contrat technique et ses limites](contrat-archives-contrats-crm.md) ; cette chaîne ne prouve ni identité vérifiée ni certification de signature.

**Que prouve un compteur de tests ?** Il donne une taille d’exécution, pas un pourcentage de confiance. Les preuves les plus utiles associent un risque, une régression, le composant réel testé et une limite explicite.

**Comment reprendre un envoi après un incident ?** La commande et la boîte sont figées avant le transport ; les brouillons fournisseurs et les pièces déjà reçues sont rapprochés avant reprise. Une acceptation confirmée et la réparation du journal SQL sont deux états distincts. Montrer une injection de panne reproductible ; annoncer que les HTTP simulés ne qualifient pas un compte fournisseur réel, ni un « exactement une fois » universel.

**Que reste-t-il avant de déployer le candidat ?** CI du SHA candidat, audit complet des dépendances, migration/configuration du runtime et recette hébergée de cette nouvelle version. La démo publique livrée conserve une portée fictive en lecture seule ; elle ne qualifie ni envois réels ni traitements permanents. Pour un usage commercial restent notamment la charge, les ressources, le stockage/limiteur réels et la récupération distante. Le budget de 0 € ne permet aucun abonnement non approuvé.

## Critère pour une présentation privée

Les parcours montrés passent sur une référence de code identifiée. Les identifiants transmis sont fictifs et destinés à cette seule présentation. Les travaux encore préparés sont décrits comme tels. Le dossier technique permet à une agence de distinguer les compétences démontrées des intégrations restant à qualifier.

Le dépôt est public ; son propriétaire a choisi de conserver pour l’instant l’absence de licence de redistribution du code propre. Vérifier les notices des dépendances, polices et médias avant redistribution ; les contrôles de publication couvrent certaines signatures de secrets dans les fichiers et l’historique. Avant une démo hébergée : valider l’environnement, son coût et ses mentions de confidentialité. Aucune identité d’exploitant commercial n’est inventée pour la démonstration.

**Comment expliquer la prospection manuelle ?** Le candidat distingue Service et Prospection dans la commande et ses révisions. Une prospection exige une preuve active pour l’adresse exacte, un seul destinataire et un retrait personnel ; les anciennes données ne reçoivent pas un consentement ou une finalité inventés. Montrer un retrait pendant la préparation fournisseur, un envoi programmé devenu inéligible et une réparation du journal sans retransmission après acceptation. La dernière relecture SQL ne rappelle pas un mail déjà accepté ; les connecteurs fictifs ne prouvent pas la délivrabilité réelle. Voir le [contrat de finalité](contrat-finalite-courriels.md).

**Comment défendre une attente après redémarrage ?** Le candidat persiste l’échéance, la position et le checkpoint en SQL, puis libère le worker. Une reprise relit cette échéance au lieu de recommencer le délai ; les tâches créées avant l’attente restent attestées et ne sont pas recréées. Les erreurs réelles possèdent leur propre compteur ; une attente longue ne consomme pas ce budget. Montrer les tests d’attentes successives, de concurrence et de panne au checkpoint, puis annoncer la limite : ils reproduisent un état durable et ne constituent pas une injection SIGKILL pendant un appel fournisseur. Voir le [contrat des attentes](contrat-attentes-scenarios.md) et la recette liée au SHA.

**Pourquoi SQLite et PostgreSQL ont-ils des traitements différents ?** Le run Campagnes a révélé des écritures métier concurrentes qui expirent sous SQLite. La correction sérialise ces tâches pour ce moteur à un seul écrivain ; PostgreSQL conserve le parallélisme. Les délais des tests ne sont pas augmentés. Distinguer cette correction de la durée globale du job CI, prolongée après mesure de l’installation système Chromium ; les seuils d’audit restent identiques. Voir les [preuves et limites SQLite/CI](qualification-sqlite-ci-20261007.md).
