# Reprise humaine des envois — contrat approuvé

État au 6 octobre 2026 : lot visible approuvé explicitement par le propriétaire, implémentation et qualification en cours. La finalité et le correctif de recherche Gmail possèdent leurs propres preuves ; ce contrat ne les déclare pas qualifiés par avance.

## Parcours proposé

Dans Communications, un onglet « Envois à vérifier » présente une liste paginée des commandes personnelles accessibles, avec boîte, objet, date et état. Les administrateurs restent soumis aux droits de société/boîte ; aucune CCI, pièce privée, capture de contenu, chemin de stockage ou credential ne passe dans la liste. Les commandes automatiques de séquences/relances sont hors de ce premier lot.

« Vérifier le résultat » effectue uniquement des lectures chez le fournisseur et journalise le contrôle. Cette action ne peut créer un brouillon distant, joindre une pièce ni transmettre un mail. « Réparer l’historique » est proposé après acceptation confirmée par une preuve liée à la commande ; il répare le journal SQL sans transport. « Classer sans relance » exige un motif et une confirmation ; le brouillon sort de la liste active et reste conservé avec sa commande et le journal de décision. Un résultat inconnu demeure inconnu, sans libellé « Non envoyé ». Cette classification bloque définitivement les relances de cette intention, y compris appels directs et programmations ; elle n’atteste pas l’absence de réception distante. Aucun bouton de renvoi automatique ou copie de CCI.

## Invariants serveur

L’auteur, la société, les droits actifs et la boîte sont vérifiés à la lecture puis au commit. Les sources historiques sont décodées/validées pour retrouver leur auteur réel ; aucune identité n’est devinée. Les champs normalisés nécessaires à une pagination complète font l’objet d’une migration/backfill vérifiable à partir des seules données déjà présentes, ou restent inconnus et inaccessibles selon la politique explicite retenue. Aucun filtrage après un plafond arbitraire de lignes.

Le contrôle distant, la réparation et la classification utilisent une identité/révision attendue et un bail SQL avec relecture aux frontières de commit. Une tâche en cours ne peut être classée concurremment, une ancienne réponse ne peut remplacer une preuve nouvelle et une acceptation déjà connue ne peut être effacée. La classification et son motif/auteur/date sont journalisés ; les erreurs partagées n’exposent pas de destinataires cachés.

L’acceptation connue et sa capture restent distinctes du statut de livraison. Le réparateur utilise exclusivement la commande figée, conserve la finalité historique nullable et ne réapplique pas le consentement courant pour appeler un nouveau transport. Un retrait ultérieur n’autorise aucun renvoi. Une commande classée peut recevoir une preuve tardive, conservée comme telle, sans réactivation de sa diffusion.

## Lecture fournisseur et incertitude

Pour Google, une recherche par Message-ID seul peut retrouver un brouillon : le contrôle d’acceptation doit cibler SENT et refuser plusieurs correspondances/une continuation ambiguë. Pour Microsoft, le contrôle distingue explicitement brouillon, acceptation et message récupéré ; un message quelconque d’une autre conversation ne vaut pas preuve de la commande. Pour Resend, une référence déjà connue peut être relue ; après perte d’une acceptation et sans référence corrélable, le résultat reste inconnu. L’absence d’un résultat de recherche n’est jamais une preuve de non-envoi. Ne pas fabriquer de rapprochement à partir du seul objet, destinataire et contenu, ni accepter un identifiant saisi arbitrairement comme preuve.

Les nouvelles lectures auront une recette HTTP fictive (403, 404, 429, panne, résultat ambigu/tardif), des limites de temps et aucune modification des fournisseurs. Comptes réels et disponibilité externe restent non qualifiés. La démo publique refuse contrôles distants et écritures ; la consultation demeure fictive.

Le contrôle utilise le jeton OAuth courant, sans effectuer de refresh : un jeton expiré ou sans scope de lecture donne Vérification indisponible. Les API de lecture sont [Gmail messages.get](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get), [Graph message](https://learn.microsoft.com/en-us/graph/api/message-get?view=graph-rest-1.0) / [isDraft](https://learn.microsoft.com/en-us/graph/api/resources/message?view=graph-rest-1.0), et [Resend retrieve](https://resend.com/docs/api-reference/emails/retrieve-email). Leur recette n’est pas une qualification fournisseur réelle.

## Compatibilité et conservation

La migration `20261006020000_manual_email_recovery` ajoute auteur normalisé, révision/progression de contrôle, preuve privée et décision de classement, ainsi qu’archivedAt pour les brouillons. Les nouvelles commandes figent leur auteur. Aucun auteur historique n’est inventé ou attribué automatiquement lors d’une consultation/build. Après migration, un opérateur peut exécuter `node --conditions=react-server --import tsx scripts/backfill-manual-email-authors.ts --apply` dans l’environnement à reprendre : le payload complet, l’appartenance à la société et les références de commande sont validés par lots de 100, sans plafond total. Les historiques invalides restent sans auteur et inaccessibles dans cette interface. La commande est idempotente et ne contacte aucun fournisseur ; elle ne doit pas être confondue avec un déploiement déjà effectué.

Le classement conserve motif/auteur/date dans la commande privée et journalise une décision sans copier le motif libre dans les journaux partagés. Il ne remplace pas le statut fournisseur par Non envoyé. Le brouillon archivé est absent de la liste active, conservé avec ses pièces, protégé contre modification/suppression/envoi/programmation et préservé dans la sauvegarde native. Les méthodes serveur vérifient cette protection au-delà de l’interface.

La réparation réunit revendication sous CAS, message, mise à jour du brouillon et audit dans une transaction SQL, après relecture des droits et du bail. Comme le journal existant, une première réparation peut préparer un fil vide avant la transaction, pour les ACL des membres ; une interruption peut conserver ce fil vide, sans fabriquer de message ni déclencher de diffusion. Les preuves tardives restent conservées ; la classification ne rappelle pas un mail distant déjà accepté.

Un message déjà importé par la synchronisation peut être rattaché sans duplication seulement s’il est sortant, sans autre commande liée, dans la même boîte, avec expéditeur/destinataires/objet/HTML et référence Internet concordants. Ses copies privées sont restaurées depuis la commande figée. Une référence déjà liée, un contenu divergent ou des références manquantes donnent un refus structuré : original et preuve sont conservés, aucun transport n’est tenté. Une divergence de normalisation HTML reste une limite de ce rapprochement conservateur, à traiter par procédure de reprise ; aucune correspondance approximative n’est fabriquée. Les événements de livraison connus, leur date et leur priorité ne sont pas rétrogradés en simple Envoyé lors de la réparation.

## Qualification attendue

SQL SQLite/PostgreSQL : auteur/boîte/société interdits, pagination complète, historique sans auteur valide, deux commandes concurrentes, preuve arrivée entre lecture et commit, classement d’une tâche active, réparation répétée sans second message, copie/pièce/finalité originales et journal de classification. L’archive conserve les données privées sans apparaître comme un mail envoyé.

HTTP : aucune requête de création/send lors d’une vérification ou réparation ; preuve positive liée à la commande et négatifs conservés inconnus ; aucune CCI dans liste/journal d’erreur. Navigateur ordinateur/mobile : états expliqués, motif/confirmation, brouillon actif retiré après classement, texte original conservé, aucune réactivation/renvoi implicitement proposée. Tests et résultats liés au SHA exact avant fermeture de ce sous-lot ; aucune qualification globale de L5/L9 présumée.
