# Passage à Prisma 7.10.1

La série Prisma 6 arrive en fin de correctifs de sécurité le 19 novembre 2026, selon le [calendrier de maintenance](https://www.prisma.io/docs/orm/release-status). Le candidat passe à Prisma 7.10.1 avec ses adaptateurs SQLite et PostgreSQL. Auth.js reste inchangé.

Le client et les métadonnées nécessaires à la disponibilité et aux protections des boîtes mail sont générés dans le code de l'application. Une fabrique choisit le pilote et borne le pool PostgreSQL. Les modèles métier et les 74 migrations existantes restent identiques ; l'index SAV appartient au correctif précédent. Les scripts de démo, sauvegarde, migration, build et l'image utilisent cette même configuration.

Le [reçu local](local.json) et le [manifeste des sources](source.json) relient les résultats aux fichiers qualifiés :

| Contrôle | Résultat |
| --- | --- |
| SQLite | 4 118 réussites, une exclusion réservée aux valeurs non finies PostgreSQL ; 307 fichiers. |
| PostgreSQL 18.6, fuseau Europe/Paris | 4 118 réussites, une exclusion de sauvegarde native SQLite. |
| Runtime Linux | Neuf contrôles réussis : migrations, sondes, worker/Redis, PDF et archive de contrat. |
| Rôle lecteur | Sept contrôles SQL, avec SELECT et seulement INSERT sur AuditLog. |
| Récupération | 144 tables, 159 lignes, un fichier PDF et une archive chiffrée restaurés et comparés. |
| Démo locale | Préparation dans une copie neuve et reprise réussies ; client généré dans la copie. |
| Qualité | Types, ESLint, Oxlint et build de 76 pages réussis ; audit npm sans avis connu sur ce lockfile. |

Les dates SQLite restent des entiers en millisecondes : une base créée avec Prisma 6 est copiée, relue et modifiée avec Prisma 7, puis relue avec Prisma 6. L'original fictif est conservé. Ce contrôle ne qualifie pas un retour arrière hébergé.

La recette a révélé des différences dans les erreurs d'unicité et de transaction annulée, ainsi qu'un débordement lors du passage d'une borne Float à PostgreSQL. Les corrections lisent les métadonnées structurées et conservent la plage finie des quantités. Les assertions métier existantes sont conservées. Les premiers échecs et les délais d'expiration observés pendant des builds simultanés sont consignés ; les suites finales passent séparément, sans augmenter leurs délais.

L'[inventaire](dependencies.json) conserve les versions et licences déclarées. Aucun paquet existant hors Prisma n'est mis à jour. L'installation reste limitée à la recette autorisée, avec scripts npm désactivés et préparation explicite du binaire SQLite. Aucun environnement existant ou service hébergé n'est migré par ces essais.

La CI du nouveau commit, les parcours navigateur distants et la connexion de la démo hébergée restent à vérifier. Le pilote pg 8 signale une dépréciation pour les requêtes concurrentes d'une transaction ; les avertissements sont conservés et ce lot ne revendique pas le support de pg 9. La récupération utilise un petit corpus fictif, sans trafic : elle ne mesure ni RTO de production, ni PITR, ni stockage distant.

## Négociation TLS en démonstration publique

La preview de `6b53ce2` termine son build mais répond 503, composant base en échec, alors que le témoin Prisma 6 répond 200. Le diagnostic ajouté dans `5483444` conserve uniquement des codes et catégories autorisés ; l'exception de connexion y reste non classée, sans message brut ni donnée de connexion.

Le [reçu TLS](tls.json) reproduit séparément le défaut : pg transforme son socket TCP en TLS sans répéter le port. Le garde exigeait ce port et refusait cette négociation. Il mémorise maintenant la destination des sockets connectés à l'infrastructure autorisée et vérifie celle-ci lors du passage en TLS. Un socket inconnu, un autre hôte, port ou nom TLS reste refusé ; aucune vérification de certificat n'est désactivée.

Le test ciblé échoue avant correction. Après correction, 47 cas voisins passent. Une PostgreSQL 18.6 neuve, sur réseau Docker interne sans port publié, reproduit aussi le refus initial puis valide quatre contrôles : SELECT natif Prisma 7, TLS confirmé par `pg_stat_ssl`, refus d'un certificat non approuvé et refus HTTP d'une origine externe. Les clés et certificats sont fictifs, les conteneurs et le réseau sont retirés. L'image qualifiée reçoit seulement le garde candidat en montage pour ce contrôle ; ce n'est pas une nouvelle qualification complète de l'image.

Dans une recette installée, le test sans connexion se rejoue avec `node node_modules/vitest/vitest.mjs run tests/unit/public-demo-network.test.ts --no-file-parallelism`. La validation Neon et les parcours authentifiés restent distincts.

## Export logique au-delà de la limite des paramètres SQL

La CI de `a54a8f5` passe PostgreSQL et Linux mais échoue sur le même export HTTP dans les deux formats navigateur : `AuditLog.findMany` lève `P2029`. La liste des ressources était envoyée dans une seule clause `IN` ordonnée. Une sonde SQLite reproduit le refus dès 1 001 identifiants ; les deux régressions SQL de volume échouent aussi avant correction.

Le [reçu d'export](backup.json) conserve ces échecs et les corrections. Les ressources sont lues par groupes de 250 ; chaque groupe conserve toutes ses pages d'audit. Le filtre des utilisateurs passe par leurs appartenances dans le même instantané sérialisable, avec le demandeur inclus comme auparavant. Les membres partagés ou inactifs restent exportés, les utilisateurs exclusivement étrangers et les ressources étrangères restent exclus. Les groupes de ressources disjoints évitent les doublons. Les plafonds existants de 50 000 lignes et 16 Mio restent appliqués et comptent désormais aussi les pages d'utilisateurs ; le délai transactionnel reste à 30 secondes.

La recette révèle séparément qu'un champ générique `token` échappe au masquage récursif. `dc9487b` retire cette clé, quelle que soit sa casse, tout en conservant compteurs et empreintes métier : une régression échoue avant le correctif, puis les huit cas d'intégrité passent. Les deux échecs de volume restent visibles à ce stade ; ils ne sont pas présentés comme corrigés par le masquage.

Après les deux correctifs, **17 cas passent sur SQLite et PostgreSQL 18.6**. Les données comprennent 1 001 ressources supplémentaires, plusieurs pages d'audit sur la même ressource, plus de 1 000 membres et deux sociétés avec un membre partagé. Typage et linters passent. Un build de production de 76 pages, une connexion HTTP avec un mot de passe fictif et l'export compilé réussissent : HTTP 200, les 1 001 catégories et audits témoins présents, sans doublon ni jeton porteur. Aucun navigateur local n'est lancé et le serveur de recette est arrêté ensuite. Cette recette ne remplace pas la nouvelle CI ni l'authentification de la démo hébergée.
