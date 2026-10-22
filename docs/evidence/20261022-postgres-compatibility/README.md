# Reprise des conflits PostgreSQL et stabilité des imports

Le [run du candidat `9f09bd5`](https://github.com/lacombechristophe/freelio/actions/runs/39855959357) applique les migrations mais termine sa suite PostgreSQL avec **3 902 réussites, dix échecs et une exclusion historique**. Les neuf contrôles natifs Linux réussissent ; leur publication échoue séparément sur le quota d’artefacts. Ces résultats ne sont pas une CI verte.

Les commits `48d510d`, `2720a02` et `be58e1f` traitent les causes observées :

- Les préparations de contrat, commande et proposition d’entretien peuvent relire leur source après une transaction explicitement annulée par la base. La reprise est bornée et activée pour ces trois opérations SQL seulement. Les codes Prisma `P2034` et les SQLSTATE PostgreSQL `40001` / `40P01` transportés par `P2010` sont reconnus. Timeout, erreur métier ou résultat de connexion inconnu ne sont pas rejoués. Les quotas d’envoi utilisent aussi une attente bornée entre essais ; aucun appel fournisseur n’est repris par ce mécanisme.
- La réservation garde son verrou de dépôt et ses refus existants. Le harnais de concurrence coordonne maintenant les deux requêtes **avant ce verrou** : il attendait auparavant deux lectures de stock derrière un verrou qui les sérialise. Les assertions sur les quantités persistées, les mouvements et l’unique effet terminal sont conservées.
- L’import d’une réception privilégie une ligne portant le produit recherché, puis départage les positions identiques par identifiant. Une ligne libre ne peut plus être choisie arbitrairement au rejeu. Le test vérifie le rattachement au produit et l’absence d’imputation sur la ligne libre.
- Le test des 10 001 créneaux conserve toutes ses assertions de résultat et de taille de réponse. Son délai de 30 secondes inclut l’insertion des fixtures PostgreSQL ; la durée de lecture est observée séparément, sans engagement de performance.

## Qualification locale

La [preuve](local.json) porte sur `be58e1fb5f94450f5f5fe461edabdea32f8f42b2` : **246 tests ciblés dans dix fichiers** passent dans une SQLite fictive neuve. Les sept cas d’import sont rejoués après la dernière précision d’assertion ; ils ne s’ajoutent pas au total de 246. Types, ESLint/Oxlint et build Next.js 16.4.2 de 76 pages passent. La recette correspond à 1 257 fichiers Git et 710 versions installées ; dépendances et schéma sont inchangés depuis la [qualification Next](../20261022-next-security/README.md).

Treize cas supplémentaires vérifient la classification des conflits, l’activation explicite et l’épuisement de la reprise. Cette recette locale ciblée ne remplace pas une suite complète ; les résultats natifs suivants portent sur un candidat ultérieur qui contient ces corrections.

Reproduction : dans une copie installée du commit, avec secrets fictifs et SQLite neuve, préparer la base puis lancer Vitest sur `document-numbering-core`, `numbering`, `email-send-quotas`, `maintenance-proposal-integrity`, `maintenance-signing-integrity`, `quote-contract-conversion`, `quote-order-conversion`, `stock-reservation-concurrency`, `warehouse-import-lifecycle` et `operations-service-directory`, avec leurs suffixes `.test.ts` / `.integration.test.ts` et `--no-file-parallelism`. La CI PostgreSQL doit appliquer les migrations versionnées sur son service fictif, puis exécuter la suite complète.

## Confirmation native sur `6274f54`

Le [nouveau run](https://github.com/lacombechristophe/freelio/actions/runs/39859480914) confirme **3 925 réussites PostgreSQL, aucun échec et une exclusion propre à la sauvegarde SQLite**, après application des 72 migrations sur une base neuve. Les dix échecs du run précédent ne se reproduisent pas. Le runner desktop passe les **3 926 tests SQLite**, types, lint, seuils de couverture et build de 76 pages ; ses deux audits ne signalent aucune vulnérabilité. L’image Linux passe ses neuf contrôles natifs.

La [preuve de cette observation](ci-6274f54.json) distingue le commit candidat `6274f54f04d37a05f00b64fad988bc0609a0cb40` du commit de fusion temporaire testé par la PR, `31c6ee695d39a787b3c9da96cca00f7279bca329`. Leurs arbres Git sont identiques. Cette référence de test ne constitue pas une fusion sur main.

**La qualification UI reste incomplète et rouge.** L’installation de Chromium sur le runner desktop échoue avant les E2E : le dépôt APT Microsoft répond HTTP 403. Le parcours mobile consigne cinq échecs avant son arrêt volontaire, après lancement de 75 des 259 cas sélectionnés. Cet arrêt économise la suite d’un run déjà en échec ; il ne transforme aucun cas en réussite. Les uploads échouent séparément sur le quota d’artefacts. Aucune de ces étapes n’est ignorée pour présenter un résultat vert.

Le [diagnostic navigateur de `9f09bd5`](ui-diagnostic-9f09bd5.json) conserve aussi les 33 échecs consignés sur deux surfaces avant leur échéance de 45 minutes. Une partie est commune aux deux surfaces : ce nombre ne désigne pas 33 défauts indépendants. Les causes observées comprennent des sélecteurs ambigus ou anciens, des préconditions fictives absentes et des exceptions métier masquées en production. Les corrections de ces parcours nécessitent leur propre qualification ; les tests non terminés ne sont pas comptés comme réussis.

## Artefacts et déploiement

Le nettoyage déjà autorisé est terminé : 256 suppressions et treize archives déjà absentes, aucune des 269 références encore présente. L’inventaire du 22 octobre conserve 292 petits artefacts natifs, environ 7,2 Mo. GitHub refuse encore les uploads ; aucune autre archive n’a été supprimée et le contrôle de publication des preuves reste bloquant.

La preview de `6274f54` est `READY`, identifiée dans la preuve ci-dessus. Cet état ne prouve ni migrations distantes ni parcours authentifiés. Leur qualification reste nécessaire avant fusion et publication.

Les demandes de lecture des protections de main et des rulesets répondent HTTP 403 : GitHub indique que cette fonction nécessite une autre offre pour ce dépôt privé. Cette limite d’offre ne prouve pas une protection effective. Visibilité, offre et budget restent inchangés.
