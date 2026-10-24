# Refus lorsque le quota ne peut pas être vérifié

Le SDK Upstash installé autorise une requête après cinq secondes sans réponse Redis (`success: true`, `reason: timeout`). Un test utilise le vrai SDK avec un Redis fictif qui ne répond jamais ; aucun appel fournisseur n'est effectué. Ce comportement est [documenté par Upstash](https://upstash.com/docs/redis/sdks/ratelimit-ts/features).

Les huit limiteurs de Freelio refusent maintenant cette décision. Une configuration absente, factice ou invalide refuse également les requêtes en production ; la sonde de disponibilité signale la configuration invalide. Les compteurs locaux restent disponibles en développement et dans la recette CI explicitement déclarée par ses trois variables serveur. Les exceptions fournisseur ne deviennent pas des autorisations.

Les 25 cas dédiés couvrent expiration, configuration, quotas locaux, exception et décisions normales. Trois cas supplémentaires vérifient la disponibilité. Le [reçu local](local.json) conserve les empreintes des fichiers et rapports : 4 099 assertions dans 306 fichiers passent sur les exécutions consignées, puis le build de 76 pages réussit. La première suite complète échoue sur la configuration du binaire PDF ; les trois fichiers concernés sont rejoués avec le Chrome 152 déjà installé. Ce reçu ne présente pas cette première exécution comme verte.

Reproduction dans une copie isolée avec SQLite fictive préparée : `npm run test:unit`, puis `npm run build`. Déclarer `PUPPETEER_EXECUTABLE_PATH` vers le Chromium existant pour inclure les contrôles PDF natifs. La suite distante, le fournisseur Upstash réel et l'indisponibilité de l'infrastructure hébergée restent des vérifications distinctes.
