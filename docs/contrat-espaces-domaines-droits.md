# Droits des synthèses par espace

## Régression observée

La [recette SQLite](evidence/20261008-workspace-access/README.md) de `71ebdca` donne 17 échecs sur 23 cas. Le lecteur commun exige seulement CRM : il renvoie des agrégats financiers à des rôles sans Finance et permet d’appeler directement Ventes, Revenus, Marketing ou Service sans leur droit de domaine. Le compteur de projets d’un client récent ne borne pas sa relation imbriquée aux agences autorisées.

Six contrôles passent : les lectures de tickets et factures au premier niveau sont bien limitées aux agences par le vrai DAL, les résultats de société Owner sont conservés, et la suspension est refusée. Il ne faut donc pas attribuer aux agrégations de premier niveau une fuite d’agence que cette recette ne reproduit pas.

## Lot approuvé et implémenté

Exiger Sales pour Ventes, Finance pour Revenus, Automatisations pour Marketing et Service pour Service. Si un membre ouvre un espace interdit, remplacer sa synthèse par un encart « Accès commercial requis », « Accès Finance requis », « Accès Automatisations requis » ou « Accès Service requis », sans données ni commandes de ce domaine. La navigation générale et les espaces autorisés restent conservés.

Dans CRM, conserver la carte « Affaires ouvertes » mais afficher « Accès commercial requis » sans Sales. Pour chaque réponse du lecteur commun, ne pas charger ni retourner montants, listes et compteurs des domaines interdits, y compris dans le mode commun utilisé par Données. Les valeurs inaccessibles sont indisponibles, jamais présentées comme des résultats zéro. Les synthèses autorisées gardent leurs chiffres et leur présentation.

Limiter le compteur de projets des clients récents à la société et aux agences accessibles. Relire les droits et agences dans l’action serveur ; l’encart seul ne protège pas un appel direct. Valider aussi le nom de l’espace à l’exécution. Les couleurs, cartes et dispositions des espaces autorisés restent inchangées ; aucun fournisseur ni envoi.

## Qualification et limites

La suite active conserve les 23 situations initiales et les étend à 31 cas : domaines autorisés, mode commun, changement de rôle avec une même session, absence de requêtes interdites et nom d’espace invalide. Le refus Service pour Sales est plus strict que le simple masquage financier du probe. Les 31 cas passent sur SQLite, avec 133 régressions Client et scores partagés. La recette navigateur préparée vérifie six rôles sur ordinateur/mobile ; son chargement ne vaut pas exécution. PostgreSQL et les CI exactes restent à obtenir pour ce lot.

Ce lot ne change pas la matrice des rôles. Les droits des migrations et de l’équipe, les plafonds historiques des graphiques, les relations imbriquées des autres collections et la diffusion des scénarios ont leurs propres qualifications. Les contrôles de boîtes privées du DAL sont conservés ; cette recette ne constitue pas une nouvelle qualification exhaustive de la messagerie.

Statut : accord explicite reçu ; implémentation dans 18b5139, recette navigateur dans 7238567. Les [contrôles locaux](evidence/20261008-workspace-access/local.json) passent : types, deux lints, 1 217 tests SQLite dans 169 fichiers et build de 75 pages. La découverte charge 244 E2E dans 46 fichiers, sans exécution locale. Les preuves du probe initial sont conservées séparément des résultats après correction.

Les deux recettes fda7be9 passent les 31 cas sur PostgreSQL et dix des douze nouveaux E2E, mais le Viewer voit le total des deux agences. Leurs conclusions `cancelled` et leurs deux échecs réels sont conservés. La [perte du contexte entre modules](evidence/20261008-context-module-reload/README.md) est reproduite puis corrigée dans fc9c91a ; sa nouvelle CI doit confirmer le périmètre Viewer. Le nettoyage des cookies du test ne remplace pas ce correctif serveur.

Les deux [CI de 77dbf8d](evidence/20261008-handlebars/ci-77dbf8d.json) passent les 31 synthèses et les huit contrôles du contexte sur PostgreSQL, ainsi que Linux. Les nouveaux avis Handlebars interrompent leurs audits avant le navigateur ; ce blocage et sa mise à jour ciblée sont conservés séparément des défauts Viewer.
