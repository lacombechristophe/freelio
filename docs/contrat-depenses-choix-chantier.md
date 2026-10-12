# Dépenses : choix du chantier

## Défaut reproduit le 12 octobre 2026

Sur `780a24f`, une recette SQLite de 101 chantiers cohérents renvoie seulement les 100 plus récents à `getProjects(undefined, 200)`. Le chantier plus ancien disparaît du sélecteur. Une dépense déjà rattachée à ce chantier conserve son identifiant lors de la sauvegarde, mais le formulaire calcule un client vide depuis cette liste incomplète : la vraie action d'édition efface alors le rattachement client. Le diagnostic reproduit le payload du formulaire ; il ne prétend pas exécuter son interface.

Le contrôle étendu reproduit aussi la perte d'un client directement rattaché à une dépense sans chantier. Le formulaire conserve maintenant ce rattachement lors d'une simple édition. Retirer délibérément un chantier garde le comportement existant de retrait de son client associé ; aucun champ Client n'est ajouté.

## Lot approuvé le 12 octobre 2026

- Rechercher et paginer par 25 les chantiers dans le formulaire Dépenses, avec total, page précédente et suivante, près du sélecteur existant.
- Relire séparément le chantier choisi, même hors page ou hors recherche ; conserver son nom et son client lors d'une édition qui ne change pas le chantier.
- Conserver les autres champs saisis pendant recherche et pagination. Un chargement ou un échec empêche la sauvegarde avec une référence non vérifiée ; la pagination commune propose de réessayer.
- Garder champs, couleurs, boutons d'enregistrement et disposition générale. Aucun nouveau champ Client ni mutation automatique n'est ajouté. Les dates, montants, justificatifs et droits existants restent distincts.

Le lecteur exige Finance et ne retourne que identifiant, nom et identifiant client. Lignes, total et sélection sont protégés par société, cohérence du client et agences actives. Une sélection devenue inaccessible ne fournit aucune métadonnée ; les mutations gardent leur validation serveur. Aucune donnée financière Client n'est nécessaire au sélecteur.

## Vérification

SQL réel : franchissement de 100 chantiers, recherche ancienne, pages stables, sélection hors page/recherche, relations étrangères, rôles et révocation d'agence. Navigateur compilé : création avec chantier ancien, édition conservant chantier/client, champs conservés pendant recherche et reprise après erreur. Les sorties de fichiers et fournisseurs restent hors recette.

`expense-project-choices.integration.test.ts` définit 23 cas sur les vraies actions, adhésions, scopes et données SQL. Authentification et cache Next sont simulés. `expense-project-choices.spec.ts` définit six parcours ordinateur/mobile ; ils vérifient aussi les identifiants client/chantier renvoyés par la vraie action de sauvegarde, y compris un rattachement client sans chantier. Le seed possède deux sociétés fictives distinctes des recettes antérieures.

La sauvegarde est indisponible pendant le chargement, après échec ou sans sélection vérifiée. Le lecteur relit la référence hors page et hors recherche ; une réponse obsolète n'écrase pas le choix actuel. Ouvrir à nouveau le formulaire provoque une nouvelle vérification, même si la sélection paraît inchangée. Les mutations existantes continuent à vérifier les relations et les droits ; cette capture ne promet pas une autorisation permanente après révocation.

Les [preuves](evidence/20261012-expense-project-selector/README.md) séparent diagnostic, qualification locale, exécution navigateur et CI du SHA publié. Aucun serveur Next ni conteneur local n'est lancé pour ce lot.
