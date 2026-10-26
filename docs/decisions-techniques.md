# Décisions techniques

Ce registre décrit les choix présents dans le code. Les versions exactes sont fixées par `package-lock.json` ; leur qualification appartient à la CI du commit livré. Les anciennes décisions et leurs amendements restent dans les [archives](history.md).

## D01 — Monolithe modulaire

Next.js porte les écrans et les points d’entrée. Les actions orchestrent les autorisations, les règles de domaine et les transactions. Un worker Node.js distinct traite les travaux BullMQ.

Ce découpage évite les coûts de coordination de services distribués pour une application développée et exploitée comme un ensemble. Une extraction de service demanderait un besoin mesuré de charge, d’isolation ou de déploiement indépendant. Certains modules restent volumineux ; leur séparation doit suivre les cas d’usage, avec conservation des invariants et tests de non-régression.

## D02 — PostgreSQL et SQLite

PostgreSQL est le moteur des environnements partagés. SQLite sert à la démo locale isolée et à une partie de la recette. Prisma 7 utilise des pilotes explicites, `adapter-pg` et `adapter-better-sqlite3`. Les migrations PostgreSQL sont versionnées ; `db push` ne sert pas à faire évoluer une base partagée.

Les deux moteurs sont testés séparément. Une suite réussie sur une base neuve ne prouve pas la mise à niveau d’une base existante. Les traitements sensibles conservent transactions, revendications conditionnelles et reprises bornées. Une restauration exige également les fichiers et les clés de chiffrement nécessaires. Les exports logiques se reprennent dans un environnement isolé. La restauration automatique de l’ancien format v2 est refusée : son graphe non typé ne permet pas de vérifier toutes les relations de la version actuelle avant réinjection.

## D03 — Autorisation à chaque frontière

Le tenant est la société ; les agences limitent certains dossiers opérationnels. Les droits de domaine s’ajoutent à ce périmètre. Le navigateur ne décide ni du `companyId`, ni de la visibilité d’une relation.

Les lecteurs et mutations vérifient la cohérence des références, pas seulement l’objet racine. Les mesures financières ou globales inaccessibles sont exclues côté serveur. Des contextes internes bornés permettent des opérations Finance précises sur des temps sans accorder un droit général Opérations.

Le profil public ajoute une interdiction des écritures et des effets fournisseur. Une lecture administrative utilise `withReadAuth` sans diminuer la permission requise. Le rôle SQL de la démo hébergée est un lecteur ; la maintenance utilise un rôle distinct.

## D04 — Auth.js et identités fournisseur

Auth.js 5 reste une dépendance beta. Mots de passe, MFA, sessions et memberships font l’objet de tests d’accès. Le remplacement de cette dépendance demanderait une recette dédiée de compatibilité des comptes et sessions.

Les boîtes Google/Microsoft et Resend sont des connexions métier distinctes de la connexion à Freelio. Elles conservent leurs capacités, propriétaire, visibilité et états de synchronisation. Leur comportement réel dépend des comptes et consentements fournisseur, non qualifiés par les transports fictifs.

## D05 — Documents figés et calculs partagés

Le moteur commercial calcule les montants en centimes, avec arrondi par ligne et répartition déterministe des remises. Les temps sont facturés depuis les secondes exactes. L’aperçu partage ce calcul et le serveur recontrôle les données avant de créer le document.

L’émission d’une facture conserve son archive ; le Studio ne la reconstitue pas depuis les coordonnées actuelles. Les nouveaux liens de contrat figent le contenu présenté. Une archive historique manquante est signalée. Les copies actuelles de devis restent distinguées des originaux envoyés ou acceptés.

Puppeteer et pdf-lib sont conservés. Le rendu bloque JavaScript et les ressources réseau arbitraires. Chromium fonctionne encore sans sandbox : les restrictions applicatives et l’utilisateur non root ne constituent pas une preuve d’isolation système complète. Les empreintes techniques ne valent pas une certification de signature ou Factur-X.

## D06 — Envois durables et reprise explicite

Les séquences, campagnes et scénarios utilisent une trace SQL durable, des versions, des baux et des commandes idempotentes. Une attente survit au redémarrage. L’inscription d’une audience vérifiée progresse par lots et conserve son rapport.

Une acceptation fournisseur peut précéder une panne locale. Le système ne promet donc pas un « exactement une fois » de bout en bout. Un résultat incertain bloque la relance ; une preuve corrélée permet de réparer l’historique sans nouvel envoi. Un classement motivé conserve la trace et interdit la relance de la commande.

La finalité des nouveaux messages est explicite. Service permet CC/CCI ; Prospection est limitée à un destinataire avec preuve active liée à l’adresse et retrait individuel. Les anciens booléens ne sont pas transformés en preuves de consentement.

## D07 — Fichiers et tâches de fond

Le stockage est local en développement et R2 privé dans le profil de production modifiable. La démo publique désactive le stockage persistant, conformément au budget retenu. Elle garde PostgreSQL et le limiteur Upstash, sans envoi réel ni worker métier actif.

Redis/BullMQ est une file de travail, pas une source de vérité. Une exploitation modifiable doit qualifier sa durabilité, les quotas, les alertes, la reprise après arrêt et la récupération conjointe de SQL, fichiers et clés.

## D08 — Maintenance et livraison

Les changements sont livrés par branche et PR, après les contrôles du [guide de test](testing.md). La production est reliée à une révision et un artefact ; une ancienne CI ne qualifie pas les changements suivants.

ESLint et Oxlint portent une politique explicite et testée. Les avis de dépendances restent bloquants au seuil configuré ; une mise à jour majeure n’est pas adoptée sur le seul critère de nouveauté. Les [notices](dependances-et-licences.md) et les limites des outils sont conservées.

Le budget courant est de 0 €. La démonstration en lecture seule sert à présenter le projet ; le stockage durable, les fournisseurs réels, la charge et la récupération hébergée restent des étapes distinctes avant un usage commercial.
