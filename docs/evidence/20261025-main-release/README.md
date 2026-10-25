# Main et domaine principal — 25 octobre 2026

Référence livrée : `a461e68cc0cb20effa5cabcbfa34fe54acf6a9b4`. Domaine : https://freelio-eight.vercel.app. Ces reçus décrivent la livraison datée ; ils ne constituent pas une qualification automatique des commits suivants.

- [Fusion](merge.json) : deux parents conservés et arbre identique au candidat qualifié.
- [CI](ci.json) : quatre jobs réussis, résultats et exclusions par moteur et surface.
- [Premier échec de main](main-ci-attempt1-diagnostic.json) : fermeture du contexte Playwright après les assertions réussies ; une seule relance manuelle, cause profonde non établie.
- [HTTP public](http.json) : dix sondes sans contournement de la protection de plateforme, dont six refus d’écriture/intégration/export.
- [Chrome public](browser.json) : connexion, lecture de factures/PDF, déconnexion, refus d’accès sans session et réouverture du compte fictif pour consultation.
- [Origine du build](staged-browser.json) : lectures desktop et émulation mobile Chrome, avec leurs limites.
- [Manifeste](manifest.json) : HTTP 200 sur la même origine publique.
- [Configuration](settings.json) : réglages temporaires rétablis et domaine conservé sur l’artefact vérifié.
- [Maintenance](maintenance.json) : activation des alertes de dépendances et état des PR de mise à jour au moment de la revue.

Les données de démonstration sont fictives. Aucun mot de passe, cookie, jeton fournisseur, chaîne SQL ou fichier métier n’est copié dans ces reçus. Les traces brutes du diagnostic restent hors dépôt ; leurs empreintes sont conservées. Les essais fournisseur simulés, l’émulation mobile et les bases fictives ne certifient pas une exploitation commerciale.
