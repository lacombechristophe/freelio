# Notifications : rendu initial stable

La CI push de **e1e67f9** ([37707090105](https://github.com/lacombechristophe/freelio/actions/runs/37707090105)) relève une erreur React 418 sur `/dashboard/notifications`, dans l’audit ordinateur. Le run PR [37707093240](https://github.com/lacombechristophe/freelio/actions/runs/37707093240) échoue aussi dans l’audit navigateur. Les autres contrôles fonctionnels passent ; les cinq alertes de développement restent distinctes. Les réussites de f5573b0 ne suffisent donc pas à clore ce défaut intermittent.

Le fil et la cloche calculaient leurs âges avec `Date.now()` pendant le rendu. Le serveur et le navigateur peuvent franchir une minute entre les deux rendus, ou avoir des horloges différentes. La lecture authentifiée calcule désormais les deux libellés une fois, puis les fournit aux composants. Les formats existants sont conservés ; un rafraîchissement de la route actualise les âges. Aucune erreur d’hydratation n’est masquée ou exclue du test.

`tests/unit/notification-age.test.ts` vérifie sept cas de limites et de formats. `tests/e2e/notifications-hydration.spec.ts` décale volontairement l’horloge du navigateur de 90 secondes et contrôle le fil, la cloche et l’absence de `pageerror`. La fixture est fictive et lue ; ce parcours n’émet aucune notification externe.

Recette locale commune avec Banque : types/lint réussis, 833 tests SQLite dans 152 fichiers et build de 74 pages réussis. La découverte des E2E ne vaut pas exécution ; le correctif navigateur reste à qualifier dans la CI du nouveau candidat. Le serveur local n’a pas été relancé pour contourner le refus de lancement antérieur.
