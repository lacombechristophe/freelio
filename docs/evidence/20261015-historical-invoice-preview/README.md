# Affichage d'une facture sans archive historique

Les deux CI mobiles de [1fcb8a5](../20261015-browser-recipes/ci-1fcb8a5.json) relèvent un HTTP 409 dans le Studio. L'API refuse correctement une facture SENT fictive Banque sans archive ; l'iframe affiche cette erreur JSON. Le [lot approuvé](../../contrat-factures-historiques-apercu.md) remplace ce chargement par l'indisponibilité explicite et désactive les deux accès PDF.

La [régression locale](local-after.json) conserve le résultat avant correction : deux anciens contrôles SSR réussis et le nouveau en échec. Après correction, les 39 cas ciblés passent, dont trois rendus Studio, cinq contrôles d'API PDF, 29 contrôles SQL de droits documentaires et deux contrôles du compilateur. La base SQL est une recette fictive isolée ; ces résultats ne sont pas des écritures en production.

Le nouvel E2E vérifie chaque surface sur sa facture Banque existante, sans écriture : texte, absence d'iframe et de requête PDF automatique, commandes désactivées, refus API conservé et snapshots facture/lignes/audits identiques. Son passage en CI reste requis. Le typage, le lint et le build local sont consignés séparément ; ils ne remplacent pas ce parcours navigateur.

Les métadonnées présentes avec fichier absent ou invalide restent hors de cet affichage spécifique. Le refus de lecture, la récupération d'archives, les fournisseurs et la charge ne sont pas qualifiés par cette correction.
