# Périmètre du client dans les aperçus documentaires

Le diagnostic [avant correction](before.json) reproduit quatre réponses HTTP 200 contenant les coordonnées d'un client d'une autre société : facture et devis, avec Owner et avec le rôle métier correspondant. Deux contrôles cohérents restent accessibles. Le [reproducteur](reproducer.test.ts.txt) utilise les routes réelles et une base fictive ; session et cache sont simulés, la génération binaire ne doit pas être appelée dans ce diagnostic HTML.

Les deux routes ajoutent le filtre `client.companyId` au filtre de société du document. Une relation incohérente reçoit le refus HTTP 404 existant avant rendu, génération binaire ou lecture d'une archive. Ce correctif complète l'introuvabilité déjà approuvée dans le [contrat des lecteurs partagés](../../contrat-lecteurs-client-partages.md).

Les [résultats locaux](local.json) comptent 2 009 tests / 206 fichiers, dont 29 cas ciblés : huit rôles, document cohérent ou étranger, retrait d'agence, session suspendue, téléchargement et archive. Types, ESLint, Oxlint et build passent. Les deux parcours compilés définis sur ordinateur/mobile vérifient les aperçus cohérents et les refus HTML/binaire ; leur exécution reste à qualifier en CI. Aucun fournisseur, document réel ou donnée de production n'est utilisé.
