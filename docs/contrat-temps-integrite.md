# Temps : intégrité des écritures

## Diagnostic du 12 octobre 2026

Dix cas SQLite sur les vraies actions, adhésions et scopes reproduisent deux plafonds de lecture et sept écritures invalides : création/édition de durées négatives ; création/édition/suppression via un chantier dont le client appartient à une autre société ; modification/suppression d'une entrée déjà rattachée à une vraie facture fictive. Le dernier cas conserve le parcours cohérent et son budget final. Ces cas passent en constatant les défauts ; authentification et cache Next sont simulés, sans fournisseur ni navigateur.

## Lot de protection approuvé le 12 octobre 2026

- Exiger `operations.write` avant les lectures des mutations, sans changer la matrice des rôles.
- Valider les durées entières strictement positives dans la capacité du champ SQL, les dates valides, la description bornée et le booléen de facturabilité. Les dates existantes gardent leur sens ; ce lot ne redéfinit pas le calendrier.
- Refuser les relations incohérentes avec les messages existants « Projet introuvable » / « Entrée introuvable ».
- Bloquer modification et suppression lorsqu'une entrée possède déjà une référence de facture, y compris un brouillon. Afficher une explication dans la notification existante, sans exposer cette référence à un rôle sans Finance.
- Rendre l'écriture du temps et le recalcul du budget indivisibles ; une panne du recalcul conserve l'état antérieur. Vérifier concurrence, refus et absence d'écriture partielle.
- Retourner les refus attendus sous une forme publique contrôlée pour que le navigateur compilé les explique ; conserver la saisie et le chronomètre après refus. Les erreurs techniques inattendues restent privées.

Aucun champ, bouton, couleur ou placement n'est ajouté dans ce lot. Il ne complète pas encore le lecteur plafonné à 500 entrées, ni les sélecteurs à 20 chantiers. Le rapprochement avec une facturation concurrente demande également son contrôle dans l'action Finance ; ne pas promettre que protéger les trois mutations Temps clôture toute la chaîne.

La qualification doit couvrir SQL réel, rôles/agences/sociétés, entrées facturées, rollback du budget et navigateur compilé. Le taux opérationnel existant de 62,50 €/h n'est pas remplacé par une nouvelle règle comptable.
