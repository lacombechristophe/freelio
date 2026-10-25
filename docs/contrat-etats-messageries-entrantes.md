# États des messages entrants et pièces OAuth

Le lot MAIL-02 complète la copie CRM des messageries Google et Microsoft. Il doit conserver l’historique local, la confidentialité des boîtes et les commandes d’envoi déjà journalisées. Les adaptateurs utilisent uniquement des lectures fournisseur ; ce lot ne marque, déplace ou supprime aucun message distant.

## Deux états distincts

Le suivi local de la conversation — ouverte, close, archivée, à lire dans Freelio — reste une décision de travail CRM. L’état fournisseur indique séparément lu/non lu, emplacement et présence distante, avec date de dernière observation. Une lecture ou un archivage local n’est pas présenté comme une commande Outlook/Gmail. Un changement distant ne réouvre pas un dossier CRM clos et ne recrée pas une réception.

Les messages historiques sans observation conservent un état fournisseur inconnu. Les compteurs existants ne servent pas à inventer un état par message. Un message supprimé à distance garde sa copie et ses liens locaux, avec une mention explicite ; les erreurs d’accès ou de réseau ne constituent jamais une preuve de suppression.

## Reprise et identité

Les identifiants OAuth existants sont déjà préfixés par l’identifiant de boîte ; leur unicité par société et fournisseur ne doit pas être remplacée par le seul identifiant distant. Les contrôles couvrent deux sociétés et deux boîtes possédant le même identifiant fournisseur, ainsi que les droits de boîte privée.

Google utilise un checkpoint `historyId` ; ses pages sont acquittées après traitement local. Un historique expiré exige une reconstruction contrôlée. Microsoft conserve un lien delta par dossier et suit les continuations opaques avec des identifiants immuables. Un retrait d’un dossier ne prouve pas une suppression définitive : une lecture par identifiant doit distinguer un déplacement d’une disparition confirmée. Les continuations restent limitées aux hôtes et chemins autorisés.

Une page échouée est rejouable sans doublon de message, événement de réception, arrêt de séquence ni contenu d’envoi. Un curseur partiel, une reconnexion ou un arrêt du worker ne doit ni effacer les copies locales ni avancer un checkpoint non traité. Les anciens messages déjà copiés restent réconciliables après la fenêtre d’import initiale ; le changement d’un vieux message ne doit pas lancer une nouvelle prospection.

Références des protocoles : [synchronisation Gmail](https://developers.google.com/workspace/gmail/api/guides/sync), [historique Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list), [delta des messages Microsoft](https://learn.microsoft.com/en-us/graph/api/message-delta), [identifiants Outlook immuables](https://learn.microsoft.com/en-us/graph/outlook-immutable-id). Les paramètres de delta et les limites d’un filtre initial doivent être vérifiés avant implémentation ; un plafond fournisseur ne peut pas être présenté comme un historique complet.

## Pièces entrantes

Les métadonnées des pièces restent liées au message et à sa boîte. Le téléchargement exige les droits sur la société, la conversation et la connexion ; une URL ou un identifiant fourni par le navigateur ne choisit jamais un hôte distant arbitraire. Les contenus sont contrôlés et bornés avant restitution. Les types non pris en charge, la connexion indisponible et une pièce distante disparue sont signalés explicitement.

La démo sans R2 ne prétend pas archiver durablement ces pièces. Toute copie privée persistante conserve ses limites de taille, son empreinte et sa politique d’accès. Le contenu d’une pièce ou d’un message ne pilote jamais une commande système ni une instruction d’automatisation hors des déclencheurs métier définis.

## Critères de sortie

La qualification couvre SQL réel et HTTP fournisseur simulé : lu/non lu, déplacement, disparition confirmée par un GET 404, erreur 403/429/5xx, expiration de checkpoint, pagination interrompue et rejouée, ancien message, pièces multiples/refusées et boîte privée. Le parcours `communications-remote-state.spec.ts` distingue suivi CRM et observation fournisseur. Sa sélection ne vaut pas exécution navigateur ; les résultats et limites sont consignés séparément dans la recette.

## Implémentation et limites

`EmailMessage.remoteObservation` est un JSON nullable validé avant stockage et projection. L'ajout ne réécrit ni les corps, ni les destinataires, ni les états historiques. Les messages existants sans observation restent inconnus. `oauth-mail-reader.ts` lit les protocoles, `email-sync.ts` reprend le travail et `remote-mail-persistence.ts` distingue première réception et simple observation.

Le worker traite au plus quatre lots de 50 identifiants par appel. Une grosse page Gmail conserve sa liste et sa position avant de progresser ; le checkpoint fournisseur n'avance qu'après traitement de toute la page. Les enveloppes JSON sont bornées, les curseurs à 20 000 caractères et une page de travail à 50 000 identifiants. Un dépassement refuse la page ; il ne la tronque pas et ne prouve pas la complétude d'une boîte volumineuse. Les limites d'exécution et la charge de vrais comptes restent à mesurer.

Le delta Graph parcourt les métadonnées des dossiers Réception et Envoyés sans filtre de date. Seuls les nouveaux corps de la fenêtre d'import sont copiés. Les anciens messages déjà copiés, y compris déplacés hors de ces dossiers, sont relus par identifiant à chaque tour terminé. Cette stratégie ne découvre pas tous les anciens messages d'une boîte ou d'un dossier arbitraire. Les libellés Gmail et dossiers Microsoft sont des observations horodatées, sans écriture distante.

Une reconnexion change la génération du travail ; les anciens checkpoints et résumés ne peuvent pas remplacer ceux de la nouvelle connexion. Le téléchargement d'une pièce autorisée peut renouveler le jeton de sa boîte par comparaison atomique des secrets chiffrés. Cette capacité ne donne aucun droit général de modification de la connexion ou de la société.

Les pièces restent chez le fournisseur. PDF, PNG et JPEG sont téléchargeables jusqu'à 5 Mo, après vérification du type, de la taille, de la signature et de la correspondance des métadonnées. Les accès société, boîte et adhésion sont revérifiés après lecture. Aucun antivirus, archivage durable, copie R2 ni compte fournisseur réel n'est qualifié par ces contrôles. La démo publique refuse toute lecture fournisseur.

## Reproduction locale isolée

Dans une copie sans `.env`, installer préalablement les dépendances du dépôt, définir une URL SQLite fictive et les secrets de recette, puis préparer cette base avec `npm run db:prepare:dev`. Exécuter `npm run test:unit`, `npm run typecheck`, `npm run lint` et `npm run build`. Ces commandes écrivent dans la base et les sorties de cette copie ; ne pas les diriger vers une instance utilisée.

`node scripts/verify-mail-observation-upgrade.mjs` crée lui-même une nouvelle base externe et vérifie la conservation des colonnes historiques. La fixture `seed-remote-mail.mjs`, appelée par la recette UI, ne contient ni jeton ni connexion active. Les appels HTTP des suites `oauth-mail-*` et `incoming-attachment.integration.test.ts` sont simulés ; PostgreSQL, Chromium et comptes réels constituent des qualifications distinctes.
