# Finalité des courriels manuels — contrat approuvé

Le 6 octobre 2026, le propriétaire a approuvé « Finalité : Service / Prospection » dans la composition, le brouillon, la programmation et l’aperçu, avec un seul destinataire en prospection et aucune CC/CCI. Le lot est implémenté sur le candidat ; les résultats de qualification sont consignés séparément dans la recette. Il s’agit d’un choix de produit pour la démonstration, sans validation juridique d’une exploitation réelle.

## Intention et compatibilité

Les nouveaux brouillons et nouvelles commandes exigent SERVICE ou MARKETING. La valeur initiale du formulaire neuf est Service ; le serveur ne devine aucune valeur manquante. Les quatre ajouts SQL sont nullables : finalité du brouillon, de la commande et du message, adresse normalisée de la preuve. La migration PostgreSQL est additive ; aucune finalité ni adresse historique n’est fabriquée.

Un ancien brouillon reste lisible et sauvegardable avec une finalité inconnue, mais nécessite un choix avant transmission ou programmation. L’affichage historique indique « Finalité non renseignée ». Une commande déjà acceptée peut réparer son journal sans nouvel appel fournisseur et sans reclassification ; une commande ancienne non acceptée sans finalité est refusée. La finalité participe à la révision/autosauvegarde et à la capture programmée. Changer une commande figée exige une nouvelle intention. Une programmation doit être annulée avant modification.

## Service, prospection et preuve

Service conserve les CC/CCI. Prospection les refuse côté serveur ; le formulaire refuse le changement tant que des copies sont saisies, puis les désactive sans effacer une saisie. Les suppressions d’adresses restent communes aux deux modes. La finalité Service n’est pas une exemption de suppression.

Une prospection exige le dernier événement actif GRANTED/CONSENT pour la société, le contact, l’adresse normalisée et EMAIL/MARKETING, avec origine, notice et empreinte de preuve. Un statut contact OPTED_IN, un import ou une ancienne preuve sans adresse ne suffit pas. Une modification de l’adresse ne transfère pas le consentement. Un retrait/refus à date identique l’emporte sur l’accord. La preuve est figée dans la commande et relue avant préparation et immédiatement avant dispatch, après préparation fournisseur/pièces. Une preuve remplacée impose une nouvelle commande. Un retrait arrête définitivement une programmation avant transmission.

Le contenu préparé ajoute un lien personnel de retrait et les en-têtes List-Unsubscribe / List-Unsubscribe-Post. Aperçu, texte et envoi utilisent le même pied de mail déterministe. PUBLIC_APP_URL est nécessaire en production ; HTTPS est exigé, sauf boucle locale explicitement isolée de recette. Aucun destinataire caché ni adresse brute n’est inscrit dans le jeton.

## Retrait et concurrence

Le jeton signé a une audience distincte des séquences. Il contient société, preuve et empreinte d’adresse ; il permet uniquement le retrait, sans lecture du compte ni réabonnement. Il reste valable sans expiration pour permettre le retrait depuis un ancien message, même après un nouvel accord à la même adresse. Une rotation de la clé invalide ces liens ; son exploitation doit préserver cette possibilité de retrait. Le hash d’adresse n’est pas une anonymisation résistante aux dictionnaires.

Le retrait vérifie la preuve dans la même société, revendique l’accord actif puis journalise une seule transition sous transaction. Les rejeux sont idempotents ; une adresse modifiée du contact n’est pas désinscrite par l’ancien lien. Les prospects et inscriptions de séquences de cette adresse sont arrêtés. Le retrait marketing n’ajoute pas une suppression universelle bloquant le Service. La route HTTP est bornée, limitée en débit, non indexable et sans cache ; la démo publique refuse les écritures.

La relecture réduit la fenêtre de concurrence, mais ne crée pas de transaction atomique entre SQL et le fournisseur : un retrait après la dernière relecture ou après acceptation distante ne peut pas rappeler un mail. La reprise d’un envoi accepté répare l’historique sans seconde transmission. Les résultats distants ambigus restent soumis au contrat de reprise existant et au prochain lot de réconciliation humaine.

## Données et preuves

La sauvegarde native conserve finalités, adresse de preuve et anciennes valeurs nulles. L’export logique conserve les messages/preuves, sans exporter les brouillons privés ou une CCI dans les DTO partagés. La qualification utilise uniquement des comptes, secrets, pièces et requêtes HTTP fictifs. Les comptes Google/Microsoft/Resend, la délivrabilité, la certification juridique et l’exploitation hébergée restent distincts.

Recette : SQL réel SQLite/PostgreSQL, suppression commune, copie interdite, société étrangère, preuve historique/inexistante/remplacée, adresse modifiée, retrait pendant préparation Gmail, retrait concurrent/rejeu, programmation figée/annulable et terminale après retrait, réparation après acceptation, sauvegarde native ; HTTP public nominal/rejeu/tamper/taille/démo ; navigateur ordinateur/mobile pour conservation, aperçu personnel, refus sans perte de saisie et historique inconnu. Les résultats et SHA exacts sont dans [la recette de complétude](completude-recette-20261003.md).
