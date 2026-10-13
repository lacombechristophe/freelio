# Boîte des prospects entrants

Le diagnostic sur `8d7b234` insère 151 demandes fictives cohérentes et une seconde société. Le lecteur retourne seulement 150 lignes, tronque le compteur des nouveaux et ne permet pas de retrouver la plus ancienne dans la recherche locale. Il transmet aussi à un Technicien un champ Affaire que le seul écran consommateur n'utilise pas. Un contrôle de société passe ; trois régressions échouent. `before.json` et le reproducteur conservent ce constat.

Le lot visible est approuvé le 13 octobre 2026. Le lecteur applique recherche et statut avant pagination par 25, avec tri stable et page corrigée si son total change. Les cartes et les sources sont calculées sur toute la société, indépendamment de la recherche, dans le même snapshot SQL. La recherche combine les mots sur les coordonnées et champs existants, notamment un prénom et un nom saisis ensemble. La liste garde la recherche et le filtre lors d'une actualisation ou erreur ; les réponses obsolètes ne remplacent pas une requête plus récente. Les écritures restent bloquées dans la démo publique.

Le champ commercial inutilisé est supprimé du chargement relationnel et du DTO. Les rattachements SQL sont conservés. Le compteur d'opt-in reste un compteur du booléen historique ; aucune preuve de consentement n'est créée ni déduite de ce booléen. Les autres relations et mutations des prospects ne sont pas qualifiées globalement par ce correctif de lecture.

`local-after.json` contient 36 contrôles SQL réussis : 151 demandes, sept pages sans doublon, tous les statuts, huit champs recherchés, nom composé, timestamp commun sur une frontière de page, huit rôles, entrées invalides, société étrangère, membership révoqué et démo en lecture seule. Authentification et cache sont simulés ; le changement de statut utilise sa transaction réelle avec moteur d'automatisation et scoring simulés. La recette ne qualifie aucun compte fournisseur.

`seed.json` vérifie les deux fixtures navigateur de 151 demandes, leur dernière page, leurs comptes fictifs et leur nettoyage. Les deux parcours compilés définis dans `tests/e2e/lead-inbox.spec.ts` vérifient pagination, recherche, refus réseau sans perte de filtre et actualisation après changement de statut. Leur définition n'est pas une preuve d'exécution ; la CI du candidat reste requise.

```sh
npx vitest run tests/unit/lead-inbox.integration.test.ts
```

Utiliser une base neuve de recette : les tests et fixtures créent et suppriment uniquement leurs données fictives. Aucun envoi ni appel métier fournisseur.

## Qualification publiée

Le candidat ffee948 est qualifié dans les deux CI (branche 38453450025 et PR 38453459048) : 2 184 tests SQLite, 2 183 PostgreSQL et une exclusion native SQLite, 385 parcours compilés et 19 exclusions historiques, neuf contrôles Linux et deux audits sans vulnérabilité. Les 36 cas de ce lot et ses deux parcours ordinateur/mobile passent sans exclusion. La preview correspondante parcourt 49 pages/onglets par surface sans erreur JavaScript, retry ni exclusion. Les rapports [CI](../20261013-candidate/ci-ffee948.json), [code](../20261013-candidate/source-ffee948.json) et [hébergement](../20261013-candidate/hosted-ffee948.json) identifient les versions exécutées.
