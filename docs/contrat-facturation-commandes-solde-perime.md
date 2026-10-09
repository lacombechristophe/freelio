# Solde d'une commande après modification d'une facture liée

## Diagnostic sur bfa6125

Une recette SQL fictive modifie le montant d'un acompte après la lecture initiale de la commande et avant sa transaction de facturation. L'acompte passe de 3 000 à 6 000 centimes sur une commande de 12 000 centimes. Le solde est créé sur l'ancienne valeur, sans refus ; le contrôle compare les factures persistées, l'état de la commande et l'audit.

La modification intermédiaire est injectée via une lecture instrumentée : elle prouve ce chemin périmé, sans qualifier deux connexions concurrentes. Session et cache Next sont simulés ; données, action, DAL et transactions SQL sont réels. Aucun document n'est émis, aucun fournisseur, PDF ou paiement n'est utilisé.

## Correctif approuvé le 9 octobre 2026

Avant de créer l'acompte ou le solde, recontrôler dans la transaction les montants et états des factures liés utilisés pour le calcul. Si le résultat diffère de la lecture initiale, refuser avec le message existant « La facturation de cette commande a changé. Rechargez la page puis réessayez. », sans nouvelle facture, changement de l'état de commande ni nouvel audit.

La modification de l'acompte restera conservée ; après rechargement, le solde devra utiliser son montant actuel. Les calculs et droits habituels seront conservés. Aucun bouton, champ, couleur ou emplacement ne change. Le contrôle des rattachements société/client/chantier et le fonctionnement de Comptabilité restent appliqués.

Vérifier les changements de montant et de statut, les témoins inchangés et la reprise après rechargement. La modification ultérieure des montants d'une facture déjà liée, la définition de la facturation après avoir et la contention entre connexions nécessitent leur qualification propre ; ce correctif ne promet pas de les résoudre.
