# Plan de reprise complète des données — HubSpot et Extrabat vers Diskoov

Date : 23 août 2026  
Statut : stratégie technique à valider sur les comptes réels  
Objectif : transférer simplement, complètement et de façon contrôlable les données de HubSpot et d'Extrabat vers le nouveau CRM Diskoov.

## 1. Recommandation

La meilleure méthode est un **ETL hybride** :

- les API extraient les objets, leurs relations et les changements jusqu'au jour de la bascule ;
- les exports natifs CSV/XLSX/ZIP constituent une seconde preuve et couvrent les zones non exposées par API ;
- les PDF, photos et autres fichiers sont téléchargés séparément et stockés avec leurs métadonnées ;
- un importeur Diskoov rejouable transforme, dédoublonne, charge et vérifie les données ;
- un dernier transfert différentiel reprend uniquement les changements survenus depuis le transfert initial.

Cette architecture permet une expérience simple pour l'administrateur — « connecter, analyser, tester, importer, finaliser » — sans confondre simplicité d'usage et absence de contrôles.

Une API seule ne garantit pas une reprise complète. Certaines configurations, historiques, contenus marketing ou pièces jointes ont leurs propres endpoints, exports ou restrictions. La complétude doit être mesurée, pas supposée.

## 2. Assistant de migration à construire dans Diskoov

Un écran réservé aux administrateurs présentera cinq étapes.

### Étape 1 — Connecter

- saisir une clé HubSpot ou autoriser l'application par OAuth ;
- saisir une clé Extrabat si l'accès lecture est autorisé ;
- déposer les archives/exports complémentaires ;
- tester la connexion et afficher précisément les permissions disponibles ;
- chiffrer les secrets et permettre leur révocation immédiate.

### Étape 2 — Analyser

- découvrir les objets, champs, pipelines, utilisateurs et associations ;
- compter les enregistrements et les fichiers par type ;
- détecter les champs inconnus, doublons probables et références cassées ;
- afficher un rapport `transférable par API / par export / à traiter manuellement / inaccessible` ;
- estimer la durée et l'espace de stockage.

### Étape 3 — Simulation

- importer un échantillon représentatif dans un espace isolé ;
- afficher le mapping source → Diskoov ;
- prévisualiser dix dossiers client complets ;
- comparer montants, statuts, dates, responsables, activités et pièces ;
- bloquer l'import si une catégorie P0 n'a pas de destination.

### Étape 4 — Import complet

- exécuter en arrière-plan avec reprise automatique après erreur ;
- présenter l'avancement par catégorie et non un simple pourcentage global ;
- permettre de relancer uniquement les échecs ;
- conserver les identifiants sources pour éviter les doublons ;
- produire un manifeste signé du résultat.

### Étape 5 — Bascule

- enregistrer un point de contrôle temporel ;
- effectuer les reprises différentielles quotidiennes ;
- geler les saisies dans l'ancien outil ;
- effectuer un dernier delta ;
- réconcilier, faire signer le procès-verbal de reprise, puis révoquer les clés.

## 3. Architecture technique du transfert

```text
HubSpot API ─────────┐
HubSpot exports ─────┤
                     ├──> zone brute chiffrée ──> normalisation ──> validation ──> CRM Diskoov
Extrabat API ────────┤            │                      │                │
Extrabat exports ────┤            └── manifeste          └── anomalies    └── rapprochement
GED/PDF/photos ──────┘
```

### 3.1 Zone brute immuable

Chaque réponse API et fichier d'export est conservé avant transformation avec :

- fournisseur, compte, type d'objet et version d'API ;
- date/heure UTC et plage de données extraite ;
- nom, taille, nombre de lignes et somme SHA-256 ;
- curseur de pagination ou point de reprise ;
- statut, nombre de tentatives et erreur éventuelle.

La zone brute permet de corriger un mapping sans rappeler l'ancien outil et constitue la preuve de ce qui a été reçu.

### 3.2 Modèles techniques à ajouter

- `DataSourceConnection` : source, état, permissions et secret chiffré ;
- `MigrationRun` : simulation, complet, delta ou final ;
- `MigrationCheckpoint` : curseur et dernière date traitée ;
- `SourceRecord` : enveloppe brute ou référence vers le stockage objet ;
- `ExternalIdMap` : couple source/type/ID vers l'ID Diskoov ;
- `MigrationIssue` : erreur, sévérité, résolution et responsable ;
- `MigrationMetric` : compte source, extrait, chargé, rejeté et réconcilié ;
- `DocumentManifest` : fichier, hash, MIME, taille, source et rattachements ;
- `MergeDecision` : doublon proposé, décision humaine et justification.

### 3.3 Propriétés indispensables de l'importeur

- **idempotent** : relancer le même lot ne crée aucun doublon ;
- **reprenable** : une panne reprend au dernier curseur confirmé ;
- **versionné** : mapping et transformateurs portent une version ;
- **observable** : volumes, temps, erreurs et appels API sont mesurés ;
- **réversible avant validation** : les données d'un lot de test peuvent être retirées sans toucher aux données métier existantes ;
- **déterministe** : mêmes données et même mapping produisent le même résultat ;
- **limité en débit** : respect des quotas, temporisation exponentielle et reprise des réponses temporaires ;
- **transactionnel** : les agrégats financiers et relations critiques sont chargés atomiquement.

## 4. Transfert HubSpot

### 4.1 Méthode recommandée

HubSpot est la source la plus simple à automatiser. Pour un seul compte Diskoov, une application privée en lecture seule peut suffire au transfert ; OAuth devient préférable si le connecteur doit ensuite être réutilisé pour plusieurs clients. La clé ne doit jamais apparaître dans les journaux ou le navigateur après saisie.

Le transfert se fera en quatre passes.

#### Passe A — schéma et configuration

- compte, utilisateurs, propriétaires et équipes ;
- définitions de propriétés et options ;
- schémas d'objets personnalisés ;
- pipelines, étapes et libellés d'associations ;
- formulaires, listes, workflows et modèles à documenter ou reconstruire.

Cette passe doit précéder les données : importer seulement les valeurs sans leur définition ferait perdre le sens des champs personnalisés.

#### Passe B — objets et associations

- contacts, sociétés, leads, deals, tickets et objets personnalisés ;
- produits, lignes, devis, commandes, factures, paiements et abonnements s'ils sont utilisés ;
- associations complètes entre tous les objets ;
- propriétaires, dates de création/modification, archivage et identifiants HubSpot.

L'API d'export CRM sait produire des exports asynchrones avec propriétés et associations. Pour le contrôle, demander aussi dans l'interface un export CSV de **toutes les propriétés et associations**. Les exports massifs peuvent être découpés en plusieurs fichiers ; l'importeur doit accepter les ZIP multi-parties.

#### Passe C — chronologie et contenus

- appels, e-mails journalisés, réunions, notes, tâches et communications ;
- conversations de boîte de réception si utilisées ;
- soumissions de formulaires et événements marketing nécessaires ;
- consentements, désinscriptions, rebonds et listes d'opposition ;
- fichiers, pièces jointes aux notes et documents commerciaux.

Les exports de fiches courantes ne suffisent pas pour les activités. HubSpot recommande ses API d'engagements pour la chronologie. Les fichiers privés nécessitent des URL signées temporaires : ils doivent être téléchargés pendant que le jeton est encore actif, puis leur hash doit être contrôlé.

#### Passe D — delta

- filtrer les objets et engagements sur leur date de dernière modification ;
- écouter les webhooks pendant la période parallèle si le délai le justifie ;
- refaire périodiquement un balayage de sécurité, car un webhook n'est pas une archive ;
- reprendre créations, modifications, associations, fusions et suppressions ;
- arrêter le delta seulement après le gel final HubSpot.

### 4.2 Matrice HubSpot

| Donnée | Canal principal | Contrôle/repli |
|---|---|---|
| propriétés et schémas | API Properties/Schemas | export des propriétés |
| contacts/sociétés/deals/tickets | Exports API ou API objets | CSV toutes propriétés/associations |
| associations | API Associations/export complet | contrôle des relations orphelines |
| activités | API calls/emails/meetings/notes/tasks | rapports d'activité ciblés |
| fichiers | Files API + URL signée | export du gestionnaire de fichiers |
| formulaires/soumissions | API ou export dédié | CSV par formulaire |
| consentements/oppositions | propriétés et exports dédiés | export rebonds/désinscriptions |
| workflows | inventaire/export | capture et reconstruction manuelle |
| rapports/tableaux | exports dédiés | inventaire visuel des indicateurs |

### 4.3 Limites à anticiper

- les exports de workflows ne contiennent pas tout l'historique ni toutes leurs performances ;
- les activités exigent des appels distincts des objets CRM ;
- certaines données sensibles peuvent être masquées selon les droits ;
- les URLs d'exports et de fichiers expirent ;
- les associations nombreuses et les gros exports sont partitionnés ;
- les actifs intégrés au site — formulaires et anciens CTA — doivent être remplacés avant désactivation.

## 5. Transfert Extrabat

### 5.1 Ce qui est établi

La documentation publique d'Extrabat confirme l'existence de clés « User API Keys » accessibles aux utilisateurs autorisés. Des intégrations officielles utilisent une clé rattachée à un tiers sélectionné. Des contenus publics mentionnent des API portant notamment sur clients, articles, pièces commerciales, stocks, GED et agenda.

En revanche, aucune référence publique complète ne permet de garantir aujourd'hui :

- que Diskoov peut créer une clé générique pour son propre exporteur ;
- les endpoints, versions, quotas et filtres disponibles ;
- l'accès en lecture à tous les modules Piscine ;
- le téléchargement en masse de la GED et des photos ;
- les changements incrémentaux, suppressions et webhooks ;
- la disponibilité de champs et relations personnalisés.

Il faut donc traiter l'API Extrabat comme une option prometteuse à qualifier, et non comme une dépendance acquise.

### 5.2 Arbre de décision

#### Scénario A — API complète en lecture

- développer un connecteur paginé par module ;
- prendre un instantané complet ;
- utiliser date de modification ou journal de changements pour les deltas ;
- télécharger la GED avec son arborescence et ses tags ;
- confronter les résultats aux exports comptables et commerciaux.

C'est le scénario le plus simple pour l'utilisateur.

#### Scénario B — API partielle

- API pour référentiels et objets accessibles ;
- exports natifs pour pièces commerciales, comptabilité, stock et statistiques ;
- archive ZIP ou téléchargement par lots pour la GED ;
- rapport d'intervention/PDF comme archive lorsque la structure détaillée n'est pas exposée ;
- dernier delta API, complété par des exports couvrant la période restante.

C'est le scénario le plus probable tant que les droits ne sont pas prouvés.

#### Scénario C — aucune API exploitable pour Diskoov

- demander officiellement à Extrabat une restitution complète dans un format structuré et documenté ;
- demander séparément la GED originale, les journaux commerciaux/comptables et les paramétrages ;
- utiliser les exports natifs par module ;
- automatiser seulement l'ingestion des fichiers obtenus ;
- réserver la navigation assistée dans l'interface aux données résiduelles, avec autorisation et dans le respect du contrat — jamais comme méthode principale.

### 5.3 Matrice Extrabat à vérifier dans le compte

| Donnée | Canal souhaité | Repli minimum |
|---|---|---|
| clients/prospects/contacts/sites | API | export commercial CSV/XLSX |
| articles/catalogues/fournisseurs | API | export articles complet |
| devis/commandes/BL/factures/avoirs | API + PDF | exports par type + PDF |
| règlements/acomptes/comptabilité | API ou export | journaux et export expert-comptable |
| stock/mouvements/réservations | API | exports inventaire et mouvements |
| agenda/planning/tâches | API | exports calendaires/tableaux |
| chantiers/interventions/SAV | API | rapports PDF + exports disponibles |
| contrats d'entretien | API | liste structurée + documents |
| équipements/séries/garanties | API | export dédié ou reconstruction contrôlée |
| GED/photos/signatures | API fichiers | archive originale avec arborescence/tags |
| utilisateurs/droits/champs/actions | API/configuration | inventaire et captures validées |

### 5.4 Demande à adresser au support Extrabat

> Objet : préparation d'une restitution complète des données Diskoov et accès API en lecture
>
> Nous souhaitons réaliser une sauvegarde et une reprise contrôlée de l'intégralité des données appartenant à Diskoov. Merci de nous confirmer :
>
> 1. la procédure pour obtenir une clé API en lecture couvrant CRM, articles, fournisseurs, pièces commerciales, règlements, stock, agenda, planning, chantiers, SAV, contrats et GED ;
> 2. la documentation des endpoints, versions, pagination, quotas, filtres de date, suppressions et téléchargement de fichiers ;
> 3. les exports complets disponibles, avec identifiants stables et relations entre objets ;
> 4. la procédure d'export massif des documents originaux, photos, signatures et métadonnées ;
> 5. la possibilité d'obtenir un export final ou une restitution structurée à la date de fin de contrat ;
> 6. les coûts, délais, restrictions et durée d'accès après résiliation.
>
> Nous demandons un accès en lecture uniquement et pouvons fournir la liste détaillée des objets et volumes à contrôler.

La réponse du support déterminera le scénario A, B ou C et devra être obtenue avant d'engager le développement spécifique du connecteur.

## 6. Mapping, doublons et règles de priorité

### 6.1 Identifiants

Conserver systématiquement :

- `sourceSystem` : `HUBSPOT` ou `EXTRABAT` ;
- `sourceObjectType` ;
- `sourceRecordId` ;
- `sourceCreatedAt`, `sourceUpdatedAt` ;
- lien ou référence d'origine quand elle reste autorisée ;
- version du mapping ayant créé la donnée Diskoov.

Les identifiants sources ne deviennent pas les clés primaires Diskoov. Ils vivent dans `ExternalIdMap`, ce qui autorise plusieurs sources pour un même client.

### 6.2 Ordre de rapprochement des personnes

1. décision déjà validée dans `ExternalIdMap` ;
2. identifiant commun présent dans les deux outils ;
3. e-mail normalisé exact ;
4. téléphone normalisé E.164 exact ;
5. nom + adresse de site avec score de confiance ;
6. proposition à un humain si le score reste ambigu.

Ne jamais fusionner automatiquement deux factures, paiements, commandes, contrats, interventions ou équipements. Les documents légaux conservent leur source, numéro, date et contenu original.

### 6.3 Autorité en cas de conflit

- consentement/désinscription : retenir l'état le plus restrictif ;
- factures, avoirs et paiements : Extrabat ou la source comptable confirmée ;
- activité commerciale avant vente : HubSpot ;
- chantier, pose, équipement et SAV : Extrabat ;
- coordonnées : valeur la plus récente, sauf validation manuelle ou source certifiée ;
- fichiers : conserver les deux versions si leurs hashes diffèrent.

Ces règles sont initiales et doivent être validées avec Diskoov avant l'import général.

## 7. Ordre de chargement

1. organisations, utilisateurs, équipes et référentiels ;
2. propriétés/champs et tables de correspondance ;
3. contacts, entreprises/foyers, adresses et sites ;
4. produits, variantes, fournisseurs et tarifs ;
5. leads, affaires, tickets et pipelines ;
6. devis, commandes clients et commandes fournisseurs ;
7. chantiers, tâches, planning et interventions ;
8. équipements, séries, garanties, contrats et SAV ;
9. factures, avoirs, paiements et écritures de rapprochement ;
10. activités, messages et chronologie ;
11. documents, photos et signatures ;
12. consentements, oppositions, audit et archives de configuration.

Les parents sont chargés avant les enfants. Une référence inconnue va dans une file d'anomalies ; elle ne doit pas être silencieusement supprimée.

## 8. Contrôles de complétude

### 8.1 Contrôles automatiques

Pour chaque type d'objet :

- nombre source = extraits + explicitement exclus ;
- extraits = importés + rejetés documentés ;
- zéro identifiant source dupliqué ;
- zéro relation P0 orpheline ;
- contrôle des sommes HT, TVA, TTC, acomptes, avoirs et règlements ;
- contrôle des quantités et valorisations de stock ;
- hash identique pour chaque fichier téléchargé ;
- échantillonnage des dates, statuts, responsables et historiques.

### 8.2 Rapport de recette

Le procès-verbal final doit afficher au minimum :

| Catégorie | Source | Extrait | Importé | Rejeté | Écart | Validateur |
|---|---:|---:|---:|---:|---:|---|
| Contacts | — | — | — | — | — | Commercial |
| Affaires | — | — | — | — | — | Direction |
| Documents | — | — | — | — | — | Administration |
| Factures/avoirs | — | — | — | — | — | Comptabilité |
| Paiements | — | — | — | — | — | Comptabilité |
| Chantiers | — | — | — | — | — | Planification |
| SAV/équipements | — | — | — | — | — | SAV |

Un taux global de 99 % ne suffit pas : une facture manquante est critique même si des milliers d'activités secondaires ont bien migré.

## 9. Sécurité et conservation

- utiliser des clés en lecture seule et aux droits minimaux ;
- créer une clé dédiée à la migration, jamais la clé personnelle d'un utilisateur ;
- chiffrer secrets, archives et sauvegardes ;
- limiter l'accès à la zone brute et journaliser chaque téléchargement ;
- ne jamais afficher un token dans une erreur ou un export ;
- analyser les fichiers et interdire les chemins dangereux ;
- révoquer les clés dès la signature de la bascule ;
- définir une durée de conservation distincte pour zone brute, archives légales et données applicatives ;
- supprimer les données de test et secrets à la fin de la recette.

## 10. Calendrier de reprise

| Moment | Action |
|---|---|
| Semaine 1 | accès administrateur, première sauvegarde et demande API Extrabat |
| Semaines 2–3 | découverte, comptages et matrice de mapping |
| Semaines 4–5 | prototype HubSpot + import échantillon |
| Semaines 6–7 | prototype Extrabat selon scénario A/B/C |
| Avant recette | import complet n°1 et correction des anomalies |
| Avant formation | import complet n°2 reproductible |
| Parallèle | deltas quotidiens et rapprochement |
| J-2 | export de sécurité et contrôle des documents |
| J0 | gel, delta final et validation |
| J+7/J+30 | audits post-bascule avant résiliation irréversible |

## 11. Critère de simplicité atteint

Le transfert sera considéré comme simple lorsque l'administrateur pourra :

1. connecter ou déposer les sources ;
2. voir immédiatement ce qui est récupérable ;
3. lancer une simulation sans risque ;
4. corriger uniquement les anomalies proposées ;
5. relancer sans doublons ;
6. obtenir un rapport prouvant que rien de critique ne manque.

La complexité reste dans le connecteur et les contrôles, pas dans les mains du gérant.

## 12. Prochaine preuve à réaliser

Avant de développer le connecteur complet :

1. créer une clé HubSpot en lecture et compter cinq objets, cinq activités et cinq fichiers ;
2. demander/produire une clé User API Extrabat et lister ses droits réels ;
3. exporter manuellement un client complet dans chaque outil ;
4. vérifier si les pièces jointes et relations possèdent des identifiants stables ;
5. construire un prototype important dix dossiers de bout en bout ;
6. comparer le dossier Diskoov obtenu avec les deux écrans sources.

Ce prototype court répondra à la question la plus risquée : « pouvons-nous réellement récupérer tout l'historique Extrabat de manière structurée ? »

## 13. Sources officielles et éléments vérifiés

- [HubSpot — exporter le contenu et les données du compte](https://knowledge.hubspot.com/account-management/export-your-content-and-data?product=crm)
- [HubSpot — exporter les enregistrements et associations](https://knowledge.hubspot.com/import-and-export/export-records)
- [HubSpot Developers — modèle ETL et Exports API](https://developers.hubspot.com/blueprints/etl)
- [HubSpot Developers — recherche des objets et engagements](https://developers.hubspot.com/docs/api-reference/latest/crm/search-the-crm)
- [HubSpot Developers — Files API et fichiers privés](https://developers.hubspot.com/docs/api-reference/latest/files/guide)
- [HubSpot Developers — webhooks](https://developers.hubspot.com/docs/api-reference/latest/webhooks/guide)
- [Extrabat — gestion des clés User API](https://servicescompris.extrabat.com/gestion-commerciale/)
- [Extrabat — exemple officiel de création d'une clé pour un tiers](https://servicescompris.extrabat.com/dossier-client/)
- [Extrabat — ressources et exports](https://www.extrabat.com/ressources/)

La documentation API Extrabat détaillée n'est pas publique dans les sources consultées. Toute estimation ferme du connecteur Extrabat doit attendre la réponse du support et un test réel des permissions.
