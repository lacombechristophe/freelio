# Droits des historiques Contact

## Régression

Sur `8ef8e79`, la recette SQL appelle le détail Contact et l’annuaire paginé avec les vraies actions, permissions et Prisma. La session est simulée et les données sont fictives dans une SQLite isolée. Vingt et une assertions donnent dix-sept échecs et quatre réussites, sans erreur de hook.

Neuf échecs concernent TECHNICIAN, ACCOUNTING et VIEWER : conversations, inscriptions aux séquences et compteurs d’engagement sont retournés sans `automation.read`, alors que Communications et Automatisations exigent ce droit. Six autres concernent les fils, messages, inscriptions, livraisons, consentements et demandes d’une autre société reliés au contact local. Les deux derniers concernent leurs compteurs dans l’annuaire. Ce sont dix-sept assertions, pas dix-sept mécanismes indépendants ; les références incohérentes sont créées dans la fixture, sans preuve de leur création par les mutations actuelles.

Les quatre contrôles réussis conservent les fils cohérents Owner, masquent la boîte privée d’un collègue pour Sales, refusent un contact étranger et une consultation après suspension. Les filtres de boîtes imbriqués existants protègent déjà une partie de la confidentialité ; ils ne remplacent pas les droits de domaine et les bornes de société des historiques.

## Lot approuvé et implémenté

Dans la fiche Contact, remplacer les trois indicateurs Conversations, E-mails envoyés et Séquences actives, ainsi que les listes Conversations et Séquences/campagnes, par « Accès Automatisations requis » sans `automation.read`. Dans l’annuaire, remplacer les compteurs e-mails/séquences par la même mention sans ce droit. Conserver les coordonnées, le badge et le filtre de consentement, les origines CRM, les accès portail et leurs cartes ; couleurs et disposition inchangées.

Côté serveur, ne pas charger les historiques et compteurs de communication interdits. Borner les historiques Contact à la société, y compris leurs messages et livraisons ; vérifier société de séquence et demande dans les inscriptions. Conserver les protections des boîtes personnelles, relire rôle et membership à chaque appel et ne pas présenter zéro comme une valeur autorisée. Les lecteurs historique et paginé de l’annuaire doivent appliquer la même politique.

## Qualification locale et suite

Le [probe et sa baseline](evidence/20261008-contact-history/README.md) sont conservés. Les 36 régressions SQL corrigées passent : Owner/Admin, domaines autorisés, boîtes partagées/personnelles, rétrogradation, suspension, société étrangère et références incohérentes. Les compteurs sont vérifiés indépendamment des listes limitées et les fils étrangers sont exclus avant le plafond des trente conversations récentes. La suite locale passe 1 364 tests dans 174 fichiers ; types, deux lints et build passent également. Les seize nouveaux parcours ordinateur/mobile sont préparés, avec leurs fixtures fictives ; leur découverte ne constitue pas leur exécution. PostgreSQL et navigateur restent à qualifier sur le candidat publié. La CI du lot chantier précédent ne qualifie pas ce changement.

Les [CI de 13a89e7](evidence/20261008-contact-history/ci-13a89e7.json) qualifient ensuite les 36 cas PostgreSQL et les seize parcours ordinateur/mobile Contacts dans les deux runs. La PR réussit globalement ; la branche est annulée après un timeout Catalogue indépendant de ce lot. La correction de synchronisation du test Catalogue doit encore être exécutée. Les résultats locaux ci-dessus et leur découverte précèdent cette qualification distante.

Les indicateurs de la fiche conservent leur calcul actuel sur les historiques récents chargés ; ce lot protège leurs droits et leur périmètre, sans revendiquer une mesure exhaustive de l’activité ni changer la définition d’un e-mail envoyé.
