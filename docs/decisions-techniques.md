# Décisions techniques — Freelio

Référence initiale : 1er octobre 2026 ; compléments du candidat mis à jour le 6 octobre. Ce registre accompagne le [plan CTO](plan-vitrine-cto-20260930.md), le [suivi du socle](execution-cto-20261001.md) et la [recette de complétude](completude-recette-20261003.md). Une décision conservée provisoirement n’est pas une validation du support à long terme ; le candidat non fusionné ne décrit pas implicitement le runtime déployé.

## D01 — Monolithe modulaire avec processus séparés

**Décision retenue.** Conserver Next.js, React et TypeScript. Les actions orchestrent des règles de domaine, des autorisations et des transactions SQL ; les documents et tâches utiles peuvent s’exécuter dans un worker séparé. Le rendu PDF interactif reste aujourd’hui principalement synchrone.

Une réécriture en microservices ou un changement de framework aurait un coût sans besoin d’isolation mesuré. La séparation web/worker répond déjà aux durées d’exécution différentes. Réexaminer une extraction après une mesure de charge ou un besoin de déploiement indépendant. Retour arrière : livraisons par module et versions d’image, sans migration simultanée de toute la stack.

## D02 — PostgreSQL pour les environnements partagés

**Décision retenue et partiellement qualifiée.** PostgreSQL sert de référence d’intégration et de future préproduction. SQLite reste disponible pour la démo locale isolée. Les extensions Prisma, transactions et migrations doivent être vérifiées sur chaque moteur annoncé.

La recette native utilise PostgreSQL 18.3, sur une instance créée pour les tests. La recette conteneur a aussi exécuté les quarante-trois migrations et un client Prisma réel sur PostgreSQL Linux 18.6. Ces preuves sur bases neuves ne couvrent pas encore une mise à niveau d’une base commerciale existante.

Le rôle de migration et le rôle de l’application sont distincts. La démo publique de recette utilise un rôle sans privilèges d’administration, avec SELECT et seulement INSERT sur AuditLog. L’isolation entre entreprises reste contrôlée par les permissions et le DAL : ce rôle SQL de démonstration n’est pas une politique RLS par tenant.

## D03 — Node 24 et dépendances verrouillées

**Décision retenue.** Aligner le lanceur local, package.json, CI et image sur Node 24.x. Le candidat du 8 octobre verrouille Next et @next/env à 16.3.8, correctif minimal des nouveaux avis. La configuration ESLint Next 16.3.6 est ensuite remplacée par les mêmes plugins ESLint et les règles Next d’Oxlint 1.87.0, avec une règle officielle conservée sous MIT : [politique et entretien](../tooling/lint/README.md). Les versions et dépendances transitives sont inscrites dans le lockfile. Les [audits du nouveau lockfile et de son installation](evidence/20261008-lint-policy/README.md) donnent zéro alerte en production et dans l’audit complet ; la CI du commit final reste nécessaire. La [qualification Next](qualification-next-20261008.md) distingue les recettes successives et le runtime déployé.

L’audit npm ne prouve pas l’absence de vulnérabilités applicatives. Les mises à jour proposées par Dependabot restent soumises à revue et recette. Les changements majeurs ne sont pas regroupés avec les correctifs métier.

## D04 — Prisma conservé ; étude majeure encore ouverte

**Décision provisoire.** Conserver Prisma 6.12 pour terminer une référence vérifiable des permissions, archives et imports. Cette version ne doit pas être présentée comme la dernière version stable maintenue. Le registre npm consulté présente une version 8 de prépublication et une version stable 7 plus récente.

La qualification de Prisma 7 doit couvrir les adaptateurs PostgreSQL/SQLite, extensions du DAL, SQL brut et transactions, TLS, génération, packaging et migrations. Ne pas mettre à niveau simultanément ORM et authentification. Condition de sortie : mêmes tests SQL, même artefact de récupération, nouveaux résultats liés au commit. Retour arrière : lockfile/client précédent tant que les migrations restent compatibles. L’absence d’alerte npm ne tranche pas la question de maintenance de la version 6.

## D05 — Auth.js conservé pendant la stabilisation

**Décision provisoire.** Conserver Auth.js pour les mots de passe, sessions et permissions existants. La dépendance reste en série beta 5 ; cette limite est explicite. La démo publique accepte uniquement le compte fictif prévu et son mot de passe ; les liens magiques et inscriptions y sont refusés côté serveur.

Une migration vers Better Auth ou une autre solution nécessite une preuve d’équivalence : mots de passe, MFA et codes de secours, sessions, révocation, memberships, CSRF et droits. Aucune supériorité n’est déduite du seul nom du fournisseur. Condition de décision : maintenance actuelle vérifiée, essai borné sur une copie et comparaison des risques. Retour arrière : pas de conversion irréversible des identifiants avant validation.

## D06 — Démo publique en lecture seule

**Décision approuvée par le propriétaire.** La découverte publique partage un jeu de données fictives consultable. Le serveur bloque les mutations, les routes sensibles et les fournisseurs ; l’interface désactive les commandes approuvées. Un visiteur conserve sa session et ses préférences locales, mais ne modifie pas les dossiers. Le flag NEXT_PUBLIC n’est jamais une autorisation serveur.

La copie locale reste modifiable. Une future recette privée sur invitation doit utiliser des tenants, identifiants, quotas et durées propres ; elle n’est pas livrée implicitement par ce mode public. Aucun reset global de données partagées n’est nécessaire pour une démo publique immuable. Des logs de consultation peuvent être ajoutés ; leur rétention et leur volume doivent être bornés dans l’hébergement final.

## D07 — BullMQ/Redis et traitements périodiques

**Décision retenue, exploitation partiellement qualifiée.** Conserver la file documentaire et les processeurs périodiques. Centraliser URL/TLS/identifiants Redis et distinguer retries de production et de consommation. Prévoir une politique Redis sans éviction. La recette Linux a consommé un véritable job documentaire et arrêté le worker sur SIGTERM. La fermeture attend les travaux en cours, avec un délai de grâce de trente secondes. La reprise après SIGKILL et TLS Redis hébergé restent à qualifier. La file documentaire n’est pas branchée aux commandes interactives courantes, qui rendent principalement les PDF en synchronisation.

Les leases SQL empêchent les démarrages concurrents pendant leur durée. Dans le candidat L2, le lease générique est renouvelé à un tiers de sa durée, avec revendication de propriétaire et signal d’annulation après perte. Les mutations sensibles doivent encore appeler `assertOwned` aux frontières de commit : un lease n’annule pas à lui seul une requête SQL ou un appel fournisseur. Les générations de copies de devis et d’archives de contrats utilisent une durée de soixante secondes et un signal Chromium de quarante-cinq secondes. Les leases d’import et de sauvegarde disposent de leurs propres mécanismes. L’ordonnanceur GitHub est désactivé par défaut ; son activation exige une URL et des secrets propres à l’environnement. Un seul responsable opérationnel doit décider quels déclencheurs sont actifs.

## D08 — Documents et récupération

**Décision retenue, runtime partiellement qualifié.** Conserver Puppeteer et pdf-lib. Désactiver JavaScript et les ressources réseau arbitraires lors du rendu ; résoudre et contrôler les images côté serveur. Conserver le PDF, le XML et les données documentaires lors de l’émission, avec empreinte et chiffrement. Les factures émises affichent leur archive dans le Studio.

Chrome s’exécute encore sans sandbox ; utilisateur non root et filtrage applicatif ne prouvent pas une isolation système suffisante. Les huit contrôles Linux du socle, dont PDF hors réseau et devis par le worker, ont passé la CI des références consignées dans la recette. Le nouvel archivage de contrats possède sa propre recette Linux ; ses résultats sont distincts et doivent être reliés au candidat. La récupération locale du socle a restauré PostgreSQL, fichiers et archive chiffrée dans une cible neuve. R2, coffre des clés, restauration après perte d’un fournisseur, RPO/RTO hébergés et rollback réel restent à qualifier.

Les nouveaux liens de contrat figent contenu compilé, coordonnées et ressources. La signature soumet l’empreinte présentée, puis conserve une capture signée et une demande durable de PDF ; les historiques sans capture ne sont pas reconstruits comme originaux. Les [invariants et limites](contrat-archives-contrats-crm.md) distinguent intégrité technique, PDF archivé, identité et certification. Les copies actuelles de devis restent explicitement distinctes d’une archive envoyée/acceptée.

## D09 — Publication et coût d’exploitation

**Décision ouverte.** Préparer une image Node complète avec Chromium et un processus worker séparé si utilisé. Choisir l’hébergeur, la région, le domaine, les services et le budget après qualification de l’image. Aucun abonnement, fournisseur ou déploiement n’est créé par ce registre.

Le propriétaire a fixé un budget de 0 € pour l’instant. La référence locale et son dossier de revue sont la livraison immédiate ; la proposition hébergée reste préparatoire. Un palier gratuit ne sera pas présenté comme un runtime disponible et récupérable tant que ses limitations ne sont pas qualifiées.

Le dépôt contient aussi des changements de présentation antérieurs à cette stabilisation. La référence de livraison doit être revue par lots et reliée à la CI avant partage. Aucun choix de licence publique du code propre n’est fait sans son propriétaire. Une présentation privée peut montrer les preuves locales en annonçant précisément leur portée.

## D10 — Finalité explicite des courriels manuels

Décision approuvée le 6 octobre : Service conserve CC/CCI ; Prospection se limite à un destinataire avec preuve active liée à l’adresse exacte, lien personnel et retrait. La finalité est conservée dans brouillons, programmation et commande ; les historiques restent nullables sans classement inventé. Le serveur exige une décision pour un nouvel envoi et relit le consentement avant dispatch. La réparation d’une acceptation distante conserve sa capture et ne renvoie pas le mail. La fenêtre SQL/fournisseur ne permet pas de rappeler une transmission déjà acceptée. [Contrat et recette](contrat-finalite-courriels.md).

Actualisation D03 au 6 octobre : `48f8643` corrige les nouvelles alertes de production et retire un CLI non utilisé. L’audit courant donne zéro alerte de production et cinq hautes de développement ; sa CI reste bloquée sur le contrôle complet. L’inventaire exact et les qualifications sont conservés dans `evidence/20261006-candidate/`.

## D11 — Reprise humaine sans nouvel effet fournisseur

Lot visible approuvé le 6 octobre : commandes personnelles paginées, contrôle GET-only, réparation SQL après preuve corrélée et classement motivé/confirmé bloquant toute relance. La décision conserve le brouillon original, sa commande et l’audit ; inconnu reste inconnu. Les identités historiques sont normalisées uniquement depuis un payload valide et une appartenance vérifiée, par maintenance explicite sans plafond total. La migration ne devine aucun auteur. Le bail partagé avec le transport, la révision et le CAS protègent les commits ; les preuves tardives ne réactivent pas une commande classée. Un message importé n’est rattaché que si sa correspondance est exacte et qu’aucune autre commande ne l’occupe. La qualification HTTP est fictive et les limites de rapprochement sont explicites dans le [contrat de reprise](contrat-reprise-humaine-courriels.md).

## D12 — Édition versionnée et audience verrouillée des campagnes

Le premier sous-lot visible et la pagination des séquences rattachées sont approuvés. Conserver le monolithe et des transactions SQL : révision explicite par campagne/livrable, saisie liée à sa version d’ouverture, vérification des références société/membres et listes de 25 avec agrégats complets. Inscription et édition revendiquent la même ligne ; une première inscription fige segment/rattachements, même après retrait ultérieur des inscriptions. Les inscriptions historiques PostgreSQL produisent un verrou à partir de leur premier enrolledAt, sans consentement inventé. Un échec de batch reste un échec ; ce sous-lot ne prétend pas fournir la future commande d’activation durable. Le [contrat Campagnes](contrat-campagnes-activation.md) conserve les sous-lots et leurs recettes séparés.
