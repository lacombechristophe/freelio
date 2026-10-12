# Périmètre du compteur de chantiers d'un modèle

Proposition du 13 octobre 2026, en attente d'accord visible. Le diagnostic SQL rattache quatre chantiers au même modèle : un accessible et cohérent, un dans une autre agence, un appartenant à une autre société et un lié à un client étranger. Le lecteur actuel renvoie quatre usages au rôle Opérations limité à une agence.

Calculer le compteur uniquement sur les chantiers de la société, liés à un client de cette société et aux agences accessibles. Owner/Admin gardent les chantiers cohérents de leur société. Le filtrage précède la réponse serveur. Les quatre lignes historiques restent conservées ; aucune réparation ou réaffectation n'est déduite du modèle.

Le badge existant présente ce nombre accessible. Titres, modèle, étapes, valeurs par défaut, champs, commandes, couleurs et disposition restent conservés. Ce lot ne pagine ni ne réécrit le catalogue des modèles.

Recette prévue : huit rôles, deux sociétés/agences, rattachements incohérents, retrait d'agence et contrôle du badge compilé sur ordinateur/mobile. Le diagnostic simule session/cache mais conserve les vraies actions, memberships et relations SQL.
