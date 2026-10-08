# Droits des clients imbriqués et documents d’un chantier

## Régression

La recette SQL de `fd9b281` teste les listes/détails de chantiers, le temps, le détail de devis, de facture et de contrat. Les vraies actions, permissions et Prisma sont utilisés avec une SQLite fictive ; session et cache Next seuls sont simulés. Quarante-cinq assertions donnent 37 échecs et huit réussites, sans erreur de hook.

Les échecs comprennent 23 réponses de champs Client trop larges, huit accès aux devis/factures/dépenses du chantier sans leur droit de domaine et six lectures de parents reliés à un client d’une autre société. Les huit contrôles positifs conservent les valeurs Owner dans les six lecteurs, refusent un chantier appartenant à une autre société et la consultation après suspension. Ce décompte mesure les assertions reproduites, pas 37 mécanismes indépendants. Les relations incohérentes sont créées dans la fixture ; leur création par les mutations courantes n’est pas établie.

## Lot approuvé et implémenté

L’accord utilisateur couvre les protections serveur et les deux mentions de la fiche chantier décrites ci-dessous. La correction est en cours de qualification ; la CI du détail d’affaire ne qualifie pas ce nouveau lot.

Sur la fiche chantier, les cartes Devis et Factures remplacent leurs listes et compteurs par « Accès commercial requis » sans Sales et « Accès Finance requis » sans Finance. Les données de ces domaines et les dépenses sont aussi exclues de la réponse serveur sans leur droit. Budgets opérationnels, temps, jalons, cartes, couleurs et disposition restent conservés ; aucune commande nouvelle.

Dans les six lecteurs, appliquer la même politique aux champs Client : caches de CA/impayé et score global indisponibles sans Finance et accès global aux agences, montant de renouvellement indisponible sans Finance. Les données stockées et les valeurs Owner/Admin sont conservées. Ces quatre champs ne sont pas affichés dans les pages concernées ; leur protection porte sur la réponse serveur.

Les listes excluent les chantiers et temps reliés à un client d’une autre société ; leurs détails, comme ceux des devis, factures et contrats incohérents, sont introuvables. Les documents imbriqués du chantier sont aussi bornés à la société. Les droits et scopes d’agence déjà établis sont conservés. La fonction de projection commune protège également les réponses de mutations Client et le détail d’affaire déjà corrigés ; elle ne filtre pas automatiquement toutes les données Prisma.

## Qualification locale et restante

Conserver le probe et ses résultats avant correction. Étendre les cas aux domaines autorisés, Finance sans accès global, rôles Owner/Admin, révocation et relations incohérentes. Rejouer les anciennes protections Client/affaires et les rendus/archives de documents. Qualifier types, lints, SQLite/PostgreSQL et les parcours ordinateur/mobile de la fiche chantier sur le candidat corrigé. La CI du détail d’affaire en cours ne qualifie pas ce futur lot.

Les [preuves locales](evidence/20261008-shared-client-readers/README.md) conservent la baseline et la référence `d7bb1e2` : 58 cas étendus, 103 régressions ciblées et 1 328 SQLite / 173 fichiers passent ; types, les deux lints sans avertissement et build de 75 pages passent aussi. Les quatorze parcours de la fiche chantier sont découverts dans les 266 E2E, sans exécution locale. PostgreSQL et navigateur restent à qualifier en CI.
