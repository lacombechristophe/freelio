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
