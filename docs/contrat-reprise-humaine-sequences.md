# Reprise humaine des envois de séquence — proposition

8 octobre 2026. Complément AUTO-05 explicitement approuvé par le propriétaire, en préparation technique. Le blocage des relances incertaines et le journal paginé ont leurs accords et preuves distincts.

## Parcours à approuver

Dans le détail existant du journal E-mails, ajouter pour les commandes de séquence incertaines : « Vérifier le résultat », état de vérification, « Réparer l’historique » après preuve positive, et « Classer sans relance » avec motif et confirmation. Conserver les cartes, styles, couleurs et commandes actuelles. Aucune nouvelle émission lors de ces opérations.

Vérifier contacte le fournisseur en lecture seule ; une absence, un brouillon ou une recherche ambiguë conserve un résultat inconnu. Réparer utilise exclusivement le contenu et l’expéditeur figés. L’inscription reste en pause : une reprise ultérieure demeure une décision explicite via la commande existante et ses contrôles. Classer conserve la commande et les traces, bloque sa relance et arrête cette inscription pour empêcher les étapes suivantes ; il ne rappelle ni ne supprime un e-mail distant. Un inconnu reste inconnu, même après classement.

## Contrat serveur

Droits automation.write, société, boîte et adhésion actuelles relus. Commande rattachée à sa séquence, étape et inscription, payload figé valide et identité fournisseur concordante. Une référence saisie librement par l’utilisateur ou une ressemblance d’objet/contenu ne constitue pas une preuve. Une donnée historique incomplète conserve son état et donne un refus explicite.

Les opérations partagent le bail du processeur de séquences ; aucune commande actuellement revendiquée ne peut être classée. Une version attendue et des comparaisons SQL empêchent l’écrasement d’une acceptation, d’un classement ou d’une progression concurrente. La vérification distante se déroule hors transaction ; droits, bail et révision sont relus avant conservation de l’observation. La preuve privée ne passe pas dans le journal de liste ni dans les erreurs publiques.

Réparer réunit historique, commande et audit sous transaction, sans transport et sans réécrire une finalité, un consentement ou un événement de livraison déjà attesté. Une exécution répétée ne crée aucun second message. Aucune progression d’étape ou réactivation n’est implicite dans cette réparation. Si une reprise explicite survient ensuite, le processeur s’appuie sur l’acceptation conservée et revérifie les droits, consentements et états avant tout autre envoi.

Classer réunit commande, arrêt de l’inscription et audit dans la même transaction. Motif, auteur et date restent conservés ; le motif privé n’est pas copié dans un journal partagé. Une preuve tardive peut être conservée après classement, sans remettre la commande ou l’inscription en file. Les tâches déjà créées et autres inscriptions ne sont pas supprimées. La démo publique interdit ces contrôles distants et mutations.

## Recette nécessaire

SQL SQLite/PostgreSQL : sociétés et boîtes étrangères, visibilité/adhésion révoquées, révision obsolète, processeur occupé, payload historique invalide, résultat arrivé entre lecture et commit, rollback au checkpoint/audit, réparation répétée sans doublon et inscription restée en pause, classement conservé avec inscription arrêtée, preuve tardive sans réactivation. HTTP simulé : uniquement GET, aucun refresh OAuth ni send ; preuve corrélée positive, résultat absent/ambigu/brouillon, 403/404/429/panne. Navigateur ordinateur/mobile : état exact, commandes conditionnelles, motif/confirmation et états conservés après rechargement.

CI du SHA candidat requise. Les recettes simulées ne qualifient ni un compte fournisseur réel, ni la délivrabilité, ni SIGKILL pendant commit, ni une garantie universelle « exactement une fois ». Ce complément ne ferme pas les autres plafonds d’Automatisations ni L8/L9.
