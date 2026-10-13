# Portail : cohérence des relations Client et Contact

Lot approuvé le 13 octobre 2026 par le propriétaire. Diagnostic sur le candidat `77a77565f9597116705ad2bc75baf94f10278716`, avec vrais lecteurs/actions, memberships et SQLite ; session et cache Next simulés. Cinq cas : un accès cohérent conservé, quatre refus attendus en échec. Les fixtures insèrent volontairement des références incohérentes. Ce résultat ne prouve pas que les formulaires ordinaires peuvent les créer, ni qu’un compte réel a été exposé.

Le lecteur accepte un jeton actif dont le client appartient à une autre société, ainsi qu’un lien dont le contact appartient à un autre client. Les actions de confirmation de rendez-vous et de révocation de lien acceptent aussi un rattachement Client étranger et produisent une mutation et un audit. Le rapport minimal et le reproducteur se trouvent à côté de ce contrat.

Proposition : vérifier que le client du lien ou de la demande appartient à la même société ; pour un contact renseigné, vérifier son rattachement à ce client. Refuser les liens incohérents comme un lien invalide, sans exposer leurs coordonnées ni ouvrir une session ; conserver l’écran actuel « Ce lien a expiré, a été révoqué ou n’est plus valide. ». Les routes utilisant une session portail reliront les mêmes relations.

Refuser la confirmation d’une demande incohérente avec « Demande de rendez-vous introuvable » et la révocation d’un lien incohérent avec « Accès portail introuvable », avant mutation et audit. Les lignes historiques et leurs références restent conservées. Les parcours cohérents, rôles et formulaires sont préservés ; aucun champ, bouton, couleur ou déplacement n’est ajouté. Écritures toujours interdites dans la démo publique.

Ce lot ne transforme pas une confirmation en réservation de calendrier et ne propose aucun envoi ou notification fournisseur. Le lien entre rendez-vous et planning reste un sujet métier distinct.

Recette de correction : accès cohérent, client étranger, contact d’un autre client de la même société et d’une autre société, lien révoqué/expiré, vérification après ouverture d’une session, refus avant écritures/audits, trois rôles CRM d’écriture et rôles sans droit. SQL sur SQLite/PostgreSQL et parcours compilé de lien invalide sur ordinateur/mobile.
La première recette a omis la suppression des clients avant leurs sociétés. Les fixtures ont été nettoyées explicitement, puis le diagnostic relancé avec cet ordre corrigé : mêmes quatre défauts et contrôle SQL à zéro société/utilisateur fictif restant. Le rapport initial est conservé séparément. Aucun fichier de diagnostic actif ne reste dans la suite de tests de la copie.
