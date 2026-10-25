# Registres des images de recette

Les deux tentatives Linux de la branche [1fcb8a5](../20261015-browser-recipes/ci-1fcb8a5.json) sont refusées par ECR en HTTP 429 avant toute construction. La PR construit le même socle et passe les neuf contrôles runtime. Aucun contrôle n'est retiré pour contourner le refus du registre.

Les [lectures publiques de manifestes](registry-receipt.json) vérifient les digests des en-têtes et des corps. Le Dockerfile utilise désormais l'image Node officielle sur Docker Hub, épinglée à l'index exact résolu par le Linux PR réussi : Node 24.22.0. Le service PostgreSQL de CI utilise également son index exact déjà testé, distinct de la variante bookworm du helper runtime. Les digests des images PostgreSQL/Redis de ce helper restent inchangés ; son fallback entre registres existe déjà.

Ces lectures ne téléchargent pas les couches et ne constituent pas un build Docker local. Docker Hub conserve ses propres quotas anonymes ; son accès depuis cette machine ne garantit pas celui de chaque runner GitHub. Les nouveaux builds et les neuf contrôles runtime doivent passer sur le commit publié. Les digests figés nécessitent des mises à jour explicites et revues.
