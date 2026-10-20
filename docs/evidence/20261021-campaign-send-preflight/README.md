# Expéditeur et plafonds avant activation d’une campagne

Code candidat : `6481266046c5c0708ac066b095e30fdacf5d668e`. Le correctif
`deaa01b` refuse des identifiants Resend illisibles ; `6481266` ajoute le
[contrôle préalable de l’expéditeur](../../contrat-preflight-expediteur-campagnes.md).
Le schéma et les migrations SQL sont inchangés depuis la qualification des
[plafonds internes](../20261020-mail-send-quotas/README.md).

Sur le code `6c2e18b`, trois [diagnostics de campagne](campaign-baseline.json)
reproduisent un rapport sans état d’expédition, une capture sans plafonds et une
capture avec plafonds désactivés. Ils sont exécutés avant implémentation, avec
leur [source conservée](campaign-reproduction.test.ts.txt). Un
[diagnostic distinct](credentials-baseline.json) rétablit seulement
`provider-credentials.ts` depuis ce commit dans une copie externe : le transport
utilise la clé de la plateforme lorsque les identifiants de la boîte sont
illisibles. Son [test](credentials-reproduction.test.ts.txt) filtre ce seul cas :
un échec et douze exclusions volontaires, sans appel réel.

Le rapport distingue le contenu, la configuration de la boîte et sa capacité
interne observée. Une configuration absente ou invalide bloque capture,
démarrage, reprise et nouveau lot. Un plafond temporairement rempli permet la
mise en attente. Le rapport ne réserve rien ; l’envoi reste soumis à sa propre
admission transactionnelle. La boîte privée d’un autre membre et ses compteurs
restent inaccessibles après un changement de rôle.

Les [résultats locaux](local.json) attachent la suite complète, son manifeste,
l’identité des sources, les contrôles statiques et leurs limites à ce commit.
Les 21 cas SQL dédiés couvrent aussi la configuration retirée après aperçu,
l’activation partielle de 201 membres, la reprise sans répétition, les scopes
mail/brouillons, les identifiants illisibles, les sociétés distinctes et la démo
publique en lecture seule. Les quatre cas SSR vérifient le rendu initial du
rapport, dont l’affichage des fenêtres UTC et l’absence de promesse de livraison.

Les passages intermédiaires sont conservés : 126 assertions réussies ne
constituaient pas une suite réussie, car le nettoyage SQL échouait. Les relations
des données fictives sont désormais retirées explicitement avant leurs sociétés,
comme dans les autres recettes de campagne. Les assertions et délais des tests
métier n’ont pas été assouplis.

## Reproduction

Utiliser une copie externe sans `.env`, avec les dépendances déjà présentes et
une base fictive neuve. Une URL absolue est indispensable si `node_modules` est
partagé avec une autre copie.

```powershell
$campaignDatabase = Join-Path (Join-Path (Get-Location) "prisma") "campaign-review-$([guid]::NewGuid().ToString('N')).db"
$env:DATABASE_URL = "file:$($campaignDatabase.Replace('\', '/'))"
$env:AUTH_SECRET = "functional-isolated-test-secret-only"
$env:ENCRYPTION_KEY = "a" * 64
$env:RESEND_API_KEY = ""
$env:EMAIL_FROM = ""
node scripts/sync-prisma-schemas.mjs
node scripts/prepare-dev-database.mjs
node node_modules/vitest/vitest.mjs run --coverage --no-file-parallelism
```

Pour les diagnostics avant correction, utiliser les sources de reproduction dans
`tests/unit/` d’une copie du commit indiqué. Le diagnostic transport peut aussi
être rejoué avec le candidat en restaurant uniquement son module listé dans le
rapport, puis avec le filtre `refuses unreadable BYOK credentials`. Ne jamais
restaurer ces fichiers dans une instance utilisée ou envoyer les valeurs fictives
à un fournisseur.

## Limites

SQLite réelle ; HTTP simulé ou interdit. Aucun compte réel, renouvellement OAuth,
DNS ou destinataire extérieur n’est utilisé par le contrôle de campagne. Les
jetons lisibles et les scopes locaux ne prouvent pas la validité distante de
l’autorisation. Domaines authentifiés, plafonds fournisseur, test sur destinataire
autorisé, délivrabilité et métriques restent des qualifications distinctes.

Les 456 cas navigateur sont sélectionnés, sans exécution. PostgreSQL, Linux,
interactions, CI distante et preview du même SHA restent à qualifier. Aucun push,
merge ou déploiement de ce lot n’est effectué : le plafond GitHub Actions à 0 € et
l’arrêt de l’usage payant ne sont pas vérifiés. La couverture publiée concerne
les six modules configurés ; elle ne représente pas toute l’application.
