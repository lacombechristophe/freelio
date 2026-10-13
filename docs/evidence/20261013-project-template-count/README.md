# Compteur des modèles de chantier

Le [diagnostic précédent](../20261013-project-choices/before.json) compte quatre chantiers là où le rôle Opérations peut en lire un. Le [contrat approuvé](../../contrat-modeles-chantier-compteur.md) conserve les références et borne le compteur à la société, aux clients cohérents et aux agences accessibles.

Les [12 cas SQL locaux](local-after.json) vérifient les huit rôles, une agence désactivée, une adhésion retirée, la conservation des six références et la démo en lecture seule. La fixture étendue contient trois chantiers cohérents pour Owner/Admin, dont un sans agence, et un seul accessible pour les autres rôles. Une agence étrangère, un client étranger et une autre société ne contribuent jamais au compteur.

La première fixture utilisait un nom de clé incorrect pour une étape ; son initialisation a échoué avant les assertions. Le correctif porte sur cette clé, sans délai ou assertion métier supprimée. Les 12 cas passent ensuite sur SQLite. Deux E2E compilés définissent la vérification du badge et de l'étape existante sur ordinateur/mobile ; PostgreSQL et navigateur restent à qualifier dans la CI publiée.
