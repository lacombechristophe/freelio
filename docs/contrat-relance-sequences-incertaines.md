# Relance des séquences après incertitude fournisseur — correctif approuvé

Date : 8 octobre 2026. Le propriétaire approuve explicitement : « Oui, bloquer les relances incertaines ». Implémentation en recette isolée ; CI propre requise avant qualification.

## Défaut reproduit

La commande actuelle Réessayer remet attempts à zéro et réactive une inscription en pause. La garde Resend du processeur protège les commandes tentées seulement lorsque attempts > 0. Un test SQL fictif appelle la vraie Server Action sur une commande DEAD_LETTER vieille de 24 heures, mise en pause avec DELIVERY_RESULT_UNCERTAIN : elle retourne success:true et modifie ces états. Le test attend un refus et échoue avant correction. Aucun appel fournisseur réel ou simulé n’est nécessaire pour reproduire cette perte de protection.

## Correction approuvée, visible uniquement par son refus

Conserver le bouton et son apparence. Refuser la relance avec « Résultat fournisseur incertain : vérifiez le résultat avant toute relance. » lorsque la fenêtre Resend est expirée (borne conservatrice de 23 heures existante), que la date du premier essai manque après une tentative, ou qu’une référence d’acceptation / classification terminale rend cette relance inappropriée. Une commande historiquement tentée avec compteur réinitialisé reste protégée via sa date ou ses références persistées ; remettre un compteur à zéro n’efface pas son histoire.

Les refus attendus sont des résultats structurés. Ils ne modifient pas commande, inscription, preuve, compteur ni date. Une relance encore sûre conserve la clé d’idempotence, le contenu, les références fournisseur et le premier essai ; elle reste soumise aux consentements/suppressions, état de campagne, boîte et droits actuels. L’action doit utiliser le bail du processeur de séquences, relire les états et comparer la révision SQL avant de réactiver ; une acceptation concurrente ne peut être écrasée. Le bail ne prouve pas une annulation distante.

La garde avant dispatch demeure indépendante de l’interface et du compteur d’essais ; un appel direct ou un compteur historique zéro ne permet pas un renvoi hors fenêtre. Aucun nouvel envoi, renouvellement OAuth, fournisseur, couleur, bouton, emplacement ou page n’est ajouté dans ce lot. Écritures interdites en démo publique.

## Vérification et limites

Tests SQL SQLite/PostgreSQL : expiration exacte, date absente, compteur historique zéro, acceptation/classement connus, société étrangère, tâche concurrente, préservation du premier essai et relance sûre avant borne. Aucun timeout augmenté ni test ignoré. Types/lint/build et CI de son SHA restent requis.

Cette correction ne fournit pas encore une interface complète de réconciliation des commandes automatiques. Si aucune preuve positive n’existe, une commande bloquée reste inconnue et son inscription en pause ; elle n’est pas transformée en Non envoyé. Le lot humain automatique devra proposer contrôle distant en lecture seule, réparation sans transport et classement motivé, avec ACL de boîte et progression explicite. Il fait l’objet d’un contrat/accord séparé.


## Implémentation et preuves en cours

Une garde commune utilise la date originale et les références/classifications persistées, indépendamment du compteur d’essais. La commande Réessayer prend le même bail global que le processeur de séquences, relit le dossier sous transaction et compare updatedAt/révision/statut avant de modifier commande et inscription. Son audit partage la transaction et conserve le nombre d’essais précédent. Une relance autorisée renouvelle le budget existant sans effacer la date du premier essai, la dernière tentative, le contenu ou les références. Les occurrences arrêtées/terminées ou dont l’étape ne correspond plus ne sont pas réactivées.

Le processeur vérifie aussi la garde immédiatement avant chaque frontière de transport. Si une préparation lente franchit les 23 heures, il conserve la commande en DEAD_LETTER et l’inscription en pause ; aucun résultat accepté n’est fabriqué. Les comparaisons SQL empêchent d’écraser une mise à jour intervenue depuis la capture. Les preuves connues ne sont pas transformées en succès d’une nouvelle transmission.

Les 22 tests ciblés de sécurité/reprise passent (3,09 s) : 16 nouveaux cas de relance, les cinq recettes d’historique existantes et un nouveau franchissement de fenêtre pendant préparation. Les refus gardent les lignes identiques et n’écrivent aucun audit de relance réussie. Les deux E2E préparés vérifient le message exact et son refus après rechargement sur ordinateur/mobile, avec commandes fictives en pause et aucune émission. Suite complète/build/CI du nouveau SHA restent en qualification.

Le test de conflit utilise un bail réellement détenu. Les comparaisons CAS sont présentes mais cette recette ne prétend pas injecter une acceptation fournisseur concurrente réelle, ni une panne SIGKILL au commit. Aucun compte réel, transport réel ou reconstitution d’acceptation sans preuve.


La recette complète finale passe 747 tests dans 146 fichiers (138,25 s), typage/lint complets. Les deux contrôles ajoutés après la première passe vérifient la suppression active et le rollback des deux lignes lorsque l’audit échoue, puis une reprise intacte après retrait de cette panne. Build applicatif réussi : compilation 19,5 s, typage Next 14,8 s et 74 pages ; seuls ces deux tests ont été ajoutés ensuite. Le schéma PostgreSQL est valide sans connexion et Playwright découvre 154 tests dans 33 fichiers. Les 18 nouveaux cas du fichier de sécurité et le nouveau franchissement pendant préparation restent à qualifier sur PostgreSQL/Chromium par la CI de ce correctif.
