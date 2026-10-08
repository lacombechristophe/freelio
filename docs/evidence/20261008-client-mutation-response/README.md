# Champs protégés dans les réponses de mutation Client

Sur `fda7be9`, les actions de création, modification et prochaine action renvoient le modèle Client complet. Le rôle Sales reçoit ainsi les caches financiers et le score global que les lecteurs ont déjà masqués. La création renvoie aussi les valeurs par défaut de ces champs ; les deux autres réponses divulguent des montants réellement stockés dans la fixture.

Le [probe de six cas](reproducer.test.ts.txt) utilise les vrais SQL, droits et actions, avec session/cache Next simulés. Les [métadonnées](baseline.json) conservent trois réponses Sales échouées et les trois contrôles Owner réussis. Chaque cas commence par le cache de chiffre d’affaires ; ces résultats ne constituent pas douze reproductions indépendantes de fuite.

Dans une copie isolée de cette référence, avec dépendances du lockfile, base neuve et secrets fictifs, copier le probe en `tests/unit/client-mutation-response.probe.test.ts`, puis exécuter :

```sh
npm run test:unit -- tests/unit/client-mutation-response.probe.test.ts
```

La correction masque chiffre d’affaires et impayé globaux sans Finance global, renouvellement sans Finance et score sans accès global. Elle conserve les valeurs stockées, les autres champs et les réponses Owner/Admin. Les formulaires existants n’utilisent pas ces champs de réponse ; aucun écran n’est modifié.

La suite active étend le probe à 22 cas : droits, stockage, société étrangère, rétrogradation, suspension, champs non acceptés par le formulaire et absence d’écriture en démo publique. Le premier nettoyage oubliait les journaux liés à l’utilisateur de test : ce hook a été corrigé, les deux utilisateurs fictifs restants ont été supprimés uniquement dans la recette isolée, puis la comparaison a été rejouée sans erreur de hook. Les trois nouveaux tests de refus exigeaient d’abord le mauvais libellé ; ils vérifient désormais le code existant exact `FORBIDDEN:crm.write`.

Cette correction concerne ces trois actions. Les lecteurs Client imbriqués dans d’autres domaines et les traces d’automatisation restent à qualifier séparément.

La correction est dans 852a67c. La [qualification locale](local.json) passe types, ESLint/Oxlint, 1 239 tests SQLite dans 170 fichiers et build de 75 pages ; 186 contrôles ciblés passent, dont les 22 nouveaux. Les cas de prochaine action sont indépendants du nom établi par les autres tests. La découverte charge les 244 E2E existants dans 46 fichiers, sans exécution locale ; le schéma PostgreSQL est validé sans connexion. La CI SQL PostgreSQL et navigateur de ce complément est une qualification distincte de celle des synthèses.
