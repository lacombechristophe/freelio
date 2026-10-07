# Volume du journal Scénarios — SQLite

Mesure du 8 octobre 2026 (heure de Paris), sur le code applicatif `e6733423b741677c7a79fee4c602c454ad379bf7`. Le [rapport brut](sqlite-volume.json) donne les six mesures de chaque requête et l’empreinte SHA-256 du [script](../../../scripts/benchmark-workflow-journal.mjs), ajouté après ce commit applicatif.

## Résultat et portée

10 000 exécutions fictives, dont 1 000 en échec, dans une société créée pour cette recette puis supprimée par cascade. Les requêtes utilisent les fonctions applicatives du journal, avec des pages de 25. La page 400 contient bien la plus ancienne ligne ; recherche et filtre retournent les totaux exacts. Le détail ne révèle pas le contenu brut et une société étrangère ne peut pas le lire. Les quatre vérifications passent.

| Requête | Première mesure (ms) | Médiane des cinq suivantes (ms) |
| --- | ---: | ---: |
| Première page | 5,28 | 2,18 |
| Dernière page, 400 | 9,04 | 9,06 |
| Recherche de la dernière ligne | 9,43 | 9,03 |
| Dernière page des échecs, 40 | 5,33 | 5,27 |
| Détail d’une exécution | 1,85 | 0,89 |

Machine : Windows x64, AMD Ryzen 5 5600X, 12 processeurs logiques ; Node 24.15.0, SQLite 3.46.0. Insertion : 657,49 ms. RSS en fin de mesure : 104,77 Mio, **pas un pic mémoire**. « Première mesure » signifie première invocation de la requête dans ce processus ; ni cache disque vidé ni redémarrage du système.

Cette mesure locale séquentielle ne qualifie pas PostgreSQL, la charge concurrente, le navigateur, le stockage hébergé, un fournisseur d’e-mails ou une interruption SIGKILL. Elle ne garantit aucune latence en production. Le journal E-mails est un autre composant, dont le complément de pagination reste proposé séparément.

## Reproduction

Utiliser une copie séparée du code, avec dépendances et schéma SQLite déjà préparés, **sans fichiers .env, secrets ni données de l’application**. Ne pas lancer dans le projet utilisé pour travailler ou présenter la démo. La copie doit pointer vers sa propre base fictive `file:./functional.db` ; aucun serveur ou fournisseur n’est nécessaire. Les variables d’authentification/chiffrement requises par cette copie doivent être fictives.

Depuis la racine de cette copie, sous PowerShell :

```powershell
$env:RECIPE_ISOLATED = 'true'
$env:DATABASE_URL = 'file:./functional.db'
$env:RECIPE_SOURCE_COMMIT = 'e6733423b741677c7a79fee4c602c454ad379bf7'
node --conditions=react-server --import tsx scripts/benchmark-workflow-journal.mjs
```

Le commit fourni doit identifier le code applicatif effectivement copié ; le script calcule lui-même sa propre empreinte. Ces variables sont réservées au processus de recette : fermer cette session après usage ou restaurer leurs valeurs antérieures. Le script refuse une autre URL SQLite et l’absence de marqueur d’isolation, crée uniquement sa société fictive et la nettoie dans `finally`, y compris après une assertion. Ce garde-fou ne remplace pas la vérification du dossier et de la base avant exécution.

La première tentative cherchait le SHA dans la copie dépourvue de `.git` : elle a échoué avant la création d’une société. Le SHA est désormais transmis par l’appelant ; le rapport conservé provient de l’exécution complète après correction et nettoyage vérifié.
