# Périmètre du client dans une affaire

## Régression

La recette SQL de `a98f275` appelle `getOpportunityDetail` avec les vraies actions, permissions, Prisma et une SQLite fictive. Seuls la session et le cache Next sont simulés. Le [probe conservé](evidence/20261008-opportunity-read/reproducer.test.ts.txt) et ses [métadonnées](evidence/20261008-opportunity-read/baseline.json) donnent onze échecs et trois réussites sur quatorze assertions, sans erreur de hook : quatre champs Client trop larges pour Sales, trois caches globaux pour un Viewer limité à une agence, projets et devis d’une autre agence, devis d’une autre société relié au client local, et affaire du pipeline local reliée à un client étranger.

Les trois contrôles réussis conservent les valeurs et les deux chantiers Owner, refusent le pipeline d’une société étrangère et la consultation après suspension. Les relations incohérentes sont créées uniquement dans la fixture pour vérifier une lecture de données anciennes ; elles ne constituent pas une preuve qu’une mutation courante permet leur création.

## Lot approuvé et implémenté

Dans le détail d’une affaire, limiter « Devis récents » et « Chantiers » à la société et aux agences accessibles. Conserver leurs titres, cartes, couleurs et liens. Un Owner/Admin garde toutes les références cohérentes de sa société. Une affaire liée à un client d’une autre société est introuvable, même si son pipeline appartient à la société courante.

Dans la réponse serveur, rendre les caches financiers globaux et le score indisponibles sans droit Finance et accès à toutes les agences ; rendre le montant de renouvellement indisponible sans Finance. Ces champs ne sont pas affichés actuellement sur cette page. Relire les droits à chaque appel, conserver les données stockées et les valeurs autorisées ; ne pas remplacer une valeur interdite par zéro.

Appliquer le périmètre avant la limite des dix références existantes. Ce lot ne transforme pas cette liste récente en annuaire complet, ne change pas la matrice des rôles et n’ajoute aucune commande. Les réponses d’autres lecteurs et les sorties d’automatismes restent distinctes.

## Qualification

L’accord explicite a été reçu. La correction borne le client parent, les documents et les chantiers dans la requête SQL, puis masque les quatre champs Client selon les droits. La suite active conserve les quatorze situations et ajoute Admin, Accounting, refus sans Sales, rétrogradation, révocation d’agence, lecture en démo, ID invalide et onze références inaccessibles plus récentes que les références autorisées. Les 23 cas étendus doivent être qualifiés dans la suite complète et en PostgreSQL.

Huit parcours navigateur sont préparés pour Owner/Admin/Sales/Viewer sur ordinateur et mobile, avec données distinctes des autres synthèses. Ils vérifient les références locales, les références globales autorisées, l’absence du devis incohérent et la page introuvable du client étranger. La découverte seule ne constitue pas leur exécution. Types, lints, SQLite/PostgreSQL et navigateur seront attribués au candidat corrigé ; aucune nouvelle qualification n’est déduite des CI encore en cours sur le lot des synthèses.

Statut : correction `6578c47`, recette navigateur `c88a0c6`. Les [preuves locales](evidence/20261008-opportunity-read/local.json) passent types, les deux lints, 1 270 SQLite / 172 fichiers, les 23 régressions ciblées et build de 75 pages. PostgreSQL est validé sans connexion ; les 252 E2E / 47 fichiers sont découverts sans exécution locale. La CI exacte doit encore qualifier ce complément.
