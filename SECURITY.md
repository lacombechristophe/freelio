# Signaler un problème de sécurité

Utiliser [le signalement privé GitHub](https://github.com/lacombechristophe/freelio/security/advisories/new). Ne pas publier de secret, de lien porteur, de donnée personnelle ou de preuve exploitable dans une issue publique.

Le rapport peut contenir la révision concernée, le profil utilisé, les étapes de reproduction sur données fictives, le résultat attendu et l’impact observé. Masquer les identifiants et les secrets dans les captures et les logs. Aucun délai contractuel de réponse n’est annoncé.

## Périmètre maintenu

Les corrections sont intégrées à `main`. Les anciens commits de qualification et les branches de travail ne constituent pas des versions maintenues séparément. Vérifier la révision servie dans l’en-tête `X-Freelio-Revision` de `/api/health/ready` avant de comparer un comportement avec le code.

La démonstration publique utilise exclusivement des données fictives, un accès en lecture seule et un rôle PostgreSQL lecteur. Les connexions fournisseur, traitements métier et écritures de fichiers y sont désactivés. Les tests de mutation ou de charge se font dans une recette isolée, pas sur la démo hébergée.

## Frontières et limites connues

- Les permissions de domaine s’ajoutent aux contrôles de société, d’agence et de cohérence des relations. Un masquage dans l’interface n’est pas un contrôle d’autorisation.
- Les jetons de portail, de signature et de retrait donnent accès à une opération précise. Ne pas les joindre à un rapport public, même pour des données fictives.
- Auth.js reste une dépendance beta. Le rendu Chromium fonctionne sans sandbox système ; les restrictions applicatives de scripts et de réseau ne constituent pas une isolation système complète.
- Les tests SQL, navigateur et transports fictifs ne sont ni un audit de sécurité indépendant, ni une qualification de fournisseurs réels.

Les [décisions techniques](docs/decisions-techniques.md), les [capacités et limites](docs/coverage-and-external-dependencies.md) et le [runbook](docs/production-runbook.md) précisent le périmètre. Une vulnérabilité reproduite n’est pas considérée comme résolue parce que sa limitation figure dans ces documents.
