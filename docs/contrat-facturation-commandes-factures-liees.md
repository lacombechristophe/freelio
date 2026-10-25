# Facturation des commandes : anciennes factures liées

## Diagnostic sur d88a6bb

Une recette SQL fictive porte sur une commande cohérente dont une facture d'acompte est rattachée à une autre société, un autre client local ou un autre chantier local. Pour chaque cas, la demande d'acompte renvoie la référence de cette facture sans refus ; la demande de solde utilise son montant et crée un nouveau brouillon. Six refus attendus échouent, deux témoins cohérents passent.

Les références incohérentes sont insérées directement dans SQL. Ce diagnostic ne prouve pas que les formulaires actuels les créent. Session et cache Next sont simulés ; action, DAL et transactions sont réels. Aucun fournisseur, paiement, document émis ou PDF n'est utilisé.

## Correctif approuvé le 9 octobre 2026

Avant de retourner une facture existante ou de calculer le solde, vérifier que les factures rattachées appartiennent à la société, au client et au chantier de la commande. Répéter le contrôle avant la revendication transactionnelle. Une relation incohérente entraîne « Commande client introuvable », sans renvoyer sa référence, créer de facture, modifier l'état ni créer d'audit.

Les factures existantes restent conservées. Le correctif ne recalcule ni ne répare leurs rattachements et montants. Les acomptes cohérents et leurs soldes restent disponibles pour les rôles Finance autorisés. Aucun bouton, champ, couleur ni emplacement ne change. Les factures historiques sans chantier alors que la commande en possède un sont également considérées incohérentes et nécessitent une réparation séparée.

La recette maintenue devra couvrir les deux modes, les références incohérentes, les commandes sans chantier, le rôle Comptabilité et un changement de rattachement entre lectures. Elle ne prétendra pas qualifier la contention entre connexions, l'émission ou les paiements. Le lot précédent de contrôle du client/chantier de la commande et l'exemption Comptabilité restent distincts.
