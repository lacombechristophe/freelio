# Guide d’une revue technique de Freelio

Freelio est un projet personnel de démonstration construit par Christophe Lacombe pour montrer sa capacité à développer une application métier et à contribuer aux projets d’une agence. Les dossiers, personnes et pièces de démonstration sont fictifs. Aucun client payant, gain financier mesuré ou certification n’est revendiqué.

## Présentation en cinq minutes

Présenter le problème : une intervention doit conserver son lien avec le client, le devis, les équipements et les pièces, tandis que les documents financiers gardent un historique stable. Montrer un dossier cohérent plutôt qu’énumérer tous les modules.

Dans le profil de démo en lecture seule, consulter un client, son devis et un PDF ; expliquer que les dossiers sont figés et les sorties fournisseurs désactivées. Ce profil est actuellement qualifié en local, sans URL publique livrée. Montrer ensuite un équipement, son ticket SAV et son intervention. La création, l’émission et l’import se démontrent dans une copie privée modifiable avec données fictives, ou à partir de traces de recette dont la portée est annoncée.

Terminer par une preuve technique concrète : l’archive d’une facture persiste après modification de l’identité du client, un ID appartenant à une autre entreprise est refusé, ou une restauration recrée base et pièces dans une cible neuve. Ne pas confondre consultation publique et simulation d’un envoi réel.

## Lecture technique en quinze minutes

1. Lire le [README](../README.md) et le [suivi d’exécution](execution-cto-20261001.md) pour connaître l’état réel.
2. Examiner les [décisions](decisions-techniques.md) : conserver la stack, PostgreSQL partagé, limites de l’authentification et du rendu PDF.
3. Suivre une mutation : action → permission → contexte d’entreprise/agence → transaction → audit. Lire `src/lib/auth-wrapper.ts`, `src/lib/prisma.ts` et un cas métier ciblé.
4. Examiner le calcul commercial, la numérotation et `src/lib/finance/issued-invoice.ts` ; retrouver leurs régressions dans la [carte des preuves](carte-des-preuves.md).
5. Lire une migration SQL, les scripts de récupération et les limites d’exploitation. Relier l’exécution au code testé, puis demander une modification limitée dans une base fictive.

## Points à savoir défendre

**Pourquoi cette stack ?** Elle permet des écrans métier, des règles serveur et des transactions locales dans un seul dépôt. Le worker existe pour des durées différentes. Un nouveau framework ou des microservices doivent répondre à un besoin mesuré.

**Comment empêcher une fuite entre entreprises ?** Les permissions encadrent les cas d’usage, le DAL ajoute des scopes tenant et agence et valide les relations écrites. Les tâches hors requête exigent un périmètre explicite. Cette approche nécessite de vérifier les nouvelles entrées et le SQL brut ; elle ne constitue pas une politique RLS générale.

**Pourquoi conserver un document émis ?** Un PDF recalculé depuis les données courantes pourrait changer après émission. L’archive garde le rendu, le XML et les données figées, avec une empreinte vérifiable. Cette mesure d’intégrité ne certifie pas à elle seule tout le système de facturation.

**Que prouve un compteur de tests ?** Il donne une taille d’exécution, pas un pourcentage de confiance. Les preuves les plus utiles associent un risque, une régression, le composant réel testé et une limite explicite.

**Que reste-t-il avant hébergement ?** CI de la version candidate, configuration HTTPS/limiteur/stockage réels, qualification de la charge et des ressources de la plateforme, récupération distante et choix d’hébergement. Linux/Chrome ont été exécutés dans la recette conteneur. Le budget est de 0 € pour l’instant : aucune URL publique ni disponibilité hébergée n’est revendiquée.

## Critère pour une présentation privée

Les parcours montrés passent sur une référence de code identifiée. Les identifiants transmis sont fictifs et destinés à cette seule présentation. Les travaux encore préparés sont décrits comme tels. Le dossier technique permet à une agence de distinguer les compétences démontrées des intégrations restant à qualifier.

Avant une ouverture publique du dépôt : choisir la licence du code propre et vérifier dépendances, polices, médias, historique et artefacts. Avant une démo hébergée : valider l’environnement, son coût et ses mentions de confidentialité. Aucune identité d’exploitant commercial n’est inventée pour la démonstration.
