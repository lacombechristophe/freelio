# Runbook de reprise et de bascule — HubSpot + Extrabat vers Diskoov

Date de référence : 24 août 2026
Statut : procédure exécutable avec le centre de migration actuel, sous réserve d'accès aux comptes réels et de validation métier.

## 1. But et règle de sécurité

Ce runbook organise la sortie de HubSpot et d'Extrabat sans perte silencieuse. La séquence est :

```text
inventorier → archiver → analyser → simuler → importer → vérifier → faire recetter → basculer → observer → résilier
```

Une résiliation n'est jamais une étape technique automatique. Elle est décidée par le gérant après signature des contrôles et expiration de la période de retour arrière.

Le centre de migration actuel ne sait pas supprimer atomiquement toutes les données créées par un lot. Tout import de répétition doit donc être réalisé sur une base isolée restaurable ; avant un import de production, une sauvegarde PostgreSQL native est obligatoire.

## 2. Responsabilités

| Rôle | Responsabilité | Approbation attendue |
|---|---|---|
| Gérant Diskoov | périmètre, gel, bascule et résiliation | go/no-go final |
| Responsable migration | planning, lots, preuves et journal de décision | rapport de reprise |
| Administrateur source | exports, clés minimales et inventaire des configurations | complétude source |
| Référent commercial | prospects, clients, activités, pipeline, consentements | recette HubSpot |
| Référent opérations/SAV | sites, dossiers, stock, équipements et interventions | recette Extrabat |
| Référent finance | devis, factures, avoirs, paiements et exports comptables | rapprochement financier |
| Responsable technique | sauvegarde, import, vérification et rollback | intégrité technique |

Une même personne peut tenir plusieurs rôles, mais le contrôle financier et le go/no-go ne doivent pas reposer uniquement sur l'auteur de l'import.

## 3. Gates avant la première écriture

- dates de renouvellement/résiliation et durée d'accès post-contrat connues ;
- administrateurs temporaires nommés ;
- volume par objet et volume documentaire mesurés ;
- export complet natif de chaque outil conservé hors de Diskoov ;
- scénario Extrabat A/API, B/hybride ou C/exports confirmé par écrit ;
- mapping et exclusions signés ;
- base et bucket de répétition distincts de la production ;
- sauvegarde/restauration PostgreSQL + R2 testée ;
- procédure manuelle pendant le gel validée ;
- aucun secret dans un ticket, un tableur ou le dépôt Git.

Tant qu'une gate manque, il est possible de poursuivre l'inventaire et les répétitions, mais pas de résilier ni d'importer dans la base de production.

## 4. Inventaire des comptes réels

Renseigner un tableau pour chaque source :

| Objet/module | Nombre actif | Nombre archivé | Pièces | Taille | Export/API | Responsable | Décision |
|---|---:|---:|---:|---:|---|---|---|
| Exemple : contacts | — | — | — | — | — | — | reprendre/exclure |

### HubSpot

Inventorier au minimum :

- contacts, sociétés, leads, deals, tickets et objets personnalisés ;
- propriétés, options, pipelines, étapes, associations, propriétaires et équipes ;
- appels, e-mails journalisés, réunions, notes, tâches et communications ;
- formulaires/soumissions, listes, workflows, séquences, modèles et scoring ;
- consentements, désinscriptions, rebonds et oppositions ;
- produits, lignes, devis, commandes, factures, paiements et abonnements utilisés ;
- fichiers, pièces jointes, rapports et intégrations du site.

### Extrabat

Inventorier au minimum :

- prospects, clients, contacts, adresses et sites ;
- fournisseurs, articles, tarifs, remises et catalogues ;
- devis, commandes, bons de livraison, factures, avoirs et règlements ;
- achats, réceptions, stocks, mouvements et réservations ;
- affaires/chantiers, agenda, planning, tâches et temps ;
- équipements, séries, garanties, SAV, interventions et contrats ;
- GED, photos, signatures, rapports et modèles ;
- exports comptables, utilisateurs, droits et personnalisations.

La [politique RGPD Extrabat](https://www.extrabat.com/politique-rgpd/) décrit une demande de restitution des données. Les pages officielles documentent aussi des [exports disponibles](https://servicescompris.extrabat.com/export/) et l'[export des écritures vers la comptabilité](https://servicescompris.extrabat.com/exporter-ecritures-de-gestion-commerciale-logiciel-de-comptabilite/). Demander au support le format, les identifiants stables, la GED originale et les délais avant toute date ferme.

## 5. Capacités du centre de migration actuel

### Présent

- connexion HubSpot par jeton d'application privée, stocké chiffré ;
- découverte des objets standards et personnalisés accessibles ;
- lancement et récupération des exports CRM HubSpot asynchrones avec propriétés et associations ;
- test d'une connexion Extrabat HTTPS configurable quand une URL et une clé officielles sont fournies ;
- création de lots manuels HubSpot ou Extrabat ;
- dépôt de CSV, JSON, XLSX, XLS, ZIP et PDF ;
- limite de 30 fichiers, 250 Mo par fichier et 500 Mo par dépôt ;
- zone brute locale en développement ou R2 en production, taille et SHA-256 ;
- extraction sûre des ZIP et archivage des fichiers intégrés ;
- analyse, classification, échantillons et anomalies ;
- simulation par type cible ;
- import avec `ExternalIdMap` et reprise idempotente des identifiants déjà connus ;
- réconciliation `source = importé + rejeté + exclu` ;
- relecture des archives, contrôle taille/SHA-256 et rapport JSON avec empreinte de preuve.

### Non présent — ne pas le supposer

- extraction générique automatique de tous les modules Extrabat ;
- OAuth HubSpot multi-portail ;
- téléchargement autonome de tous les fichiers privés, boîtes de réception, formulaires, workflows et actifs marketing HubSpot ;
- CDC/webhooks ou delta planifié automatiquement ;
- prise en compte automatique des suppressions dans les sources ;
- interface de mapping champ par champ éditable par l'administrateur ;
- fusion humaine interactive des doublons ambigus ;
- annulation transactionnelle d'un lot déjà importé ;
- exécution durable de l'import en arrière-plan ;
- vérification métier exhaustive des totaux financiers, valorisations de stock et relations ;
- signature qualifiée du procès-verbal.

Ces écarts sont couverts par des exports complémentaires, des contrôles humains et une sauvegarde restaurable. Ils demeurent des blockers si les comptes réels en dépendent.

## 6. Préparation des exports

### 6.1 Convention de fichiers

Utiliser une arborescence hors dépôt :

```text
AAAA-MM-JJ_SOURCE_TYPE/
  00-manifeste/
  10-configuration/
  20-referentiels/
  30-commercial/
  40-operations/
  50-finance/
  60-documents/
  90-rapports-source/
```

Le manifeste externe contient : nom source, compte, fuseau, période, exporteur, date UTC, filtres, nombre de lignes/fichiers, taille, SHA-256 et éventuelles erreurs. Conserver les fichiers bruts en lecture seule ; toute correction de format produit un nouveau fichier dérivé.

### 6.2 HubSpot

1. Créer une application privée temporaire avec les droits de lecture strictement nécessaires.
2. Dans `/dashboard/migrations`, enregistrer, tester puis lancer la découverte.
3. Examiner les objets inaccessibles et corriger les scopes si justifié.
4. Lancer l'instantané, puis « Actualiser » jusqu'à téléchargement ou erreur de chaque export.
5. En parallèle, exporter depuis HubSpot toutes les propriétés et associations.
6. Exporter séparément les activités, consentements/oppositions, formulaires, actifs marketing et fichiers qui ne sont pas couverts par l'export CRM obtenu.
7. Conserver la configuration des pipelines/workflows sous une forme lisible pour reconstruction et audit.

Références officielles : [Exports API](https://developers.hubspot.com/docs/api-reference/latest/crm/exports/create-export), [guide d'export](https://developers.hubspot.com/docs/api-reference/latest/crm/exports/guide), [usage des API](https://developers.hubspot.com/docs/api/how-to-use-hubspot-api) et [API objets CRM](https://developers.hubspot.com/docs/api-reference/latest/crm/using-object-apis).

### 6.3 Extrabat

1. Demander au support une clé en lecture, la documentation des endpoints et une restitution complète.
2. Si un endpoint officiel est fourni, enregistrer son URL, son chemin de test et son schéma d'authentification, puis utiliser « Tester ».
3. Ne pas interpréter un test HTTP réussi comme une preuve de couverture des modules.
4. Exporter chaque module disponible avec tous les champs et identifiants.
5. Obtenir les PDF **et** les données structurées des pièces commerciales.
6. Obtenir la GED originale, les photos et leurs rattachements, pas seulement des captures d'écran.
7. Exporter séparément stock à date, mouvements, réservations, paiements et écritures comptables.
8. Déposer les fichiers dans un lot manuel Extrabat.

Si l'API n'est pas documentée, le scénario officiel est l'ingestion des exports structurés. Une automatisation de navigation ne doit pas devenir la source principale de la reprise.

## 7. Analyse, simulation et import de répétition

Pour chaque source, sur une base isolée :

1. Créer ou ouvrir le lot.
2. Déposer les archives et noter l'identifiant du lot.
3. Lancer « Analyser les archives ».
4. Télécharger/consulter les anomalies et arrêter sur toute erreur P0.
5. Vérifier les types détectés et les échantillons.
6. Lancer « Simuler ».
7. Comparer les compteurs cibles aux compteurs source.
8. Sauvegarder la base de répétition.
9. Lancer « Importer ».
10. Lancer « Vérifier ».
11. Télécharger le rapport `/api/migrations/{runId}/report` et conserver son `Digest`/empreinte.
12. Réaliser les contrôles métier ci-dessous.

Un statut `VERIFIED` prouve les invariants techniques implémentés ; il ne prouve pas à lui seul la fidélité fonctionnelle des données.

### Ordre logique des données

Le moteur classe les objets avant import, mais les exports doivent autant que possible respecter :

1. clients et contacts ;
2. sites et fournisseurs ;
3. produits et dépôts ;
4. opportunités et projets ;
5. équipements, SAV, interventions et contrats ;
6. commandes achat/client, réceptions, livraisons, réservations et mouvements ;
7. devis, commandes clients, factures et lignes ;
8. paiements et activités.

Les relations sans parent peuvent être rattachées à des fiches « À rapprocher · Migration … ». Leur présence doit être traitée comme une anomalie métier avant bascule.

## 8. Contrôles de recette obligatoires

### 8.1 Automatiques disponibles

- compte source/importé/rejeté/exclu par type ;
- une cible et une correspondance d'identifiant pour chaque ligne marquée importée ;
- absence d'écart arithmétique dans les métriques ;
- lisibilité, taille et SHA-256 des archives ;
- état `VERIFIED` ou liste explicite des erreurs.

### 8.2 Contrôles métier complémentaires

| Domaine | Contrôle | Tolérance |
|---|---|---|
| Prospects/clients | volumes actifs/archivés, coordonnées, responsables, prochaines actions | aucun P0 manquant |
| Consentements | état le plus restrictif, date, source, preuve et opposition | zéro opt-in inventé |
| Pipeline | nombre et valeur par étape, gagné/perdu, dates | écarts expliqués |
| Documents commerciaux | numéros, dates, statuts, HT/TVA/TTC, lignes, PDF | zéro pièce légale manquante |
| Paiements | somme par facture et période, références | concordance comptable |
| Stock | quantité physique, réservée, disponible par dépôt/produit | concordance signée |
| Achats/livraisons | lignes, quantités reçues/livrées et reliquats | écarts expliqués |
| Projets | client, site, relevé, jalons, documents | échantillon complet |
| Parc installé | site, produit, série, pose et garantie | zéro actif critique orphelin |
| SAV/interventions | ticket, équipement, technicien, rapport, photos, signature | historique lisible |
| Fichiers | nombre, taille, hash et ouverture | 100 % des critiques |

Échantillon minimal recommandé : dix dossiers complets, toutes les factures ouvertes, toutes les réservations actives, tous les contrats actifs et les cas présentant les plus gros montants.

### 8.3 Test d'idempotence

Sur une restauration de la même base :

1. réimporter exactement le même lot ;
2. vérifier qu'aucun client, document ou paiement supplémentaire n'est créé ;
3. comparer les `ExternalIdMap` et volumes avant/après ;
4. documenter toute différence.

## 9. Répétitions et delta final

Réaliser au minimum deux répétitions complètes. La deuxième doit partir d'une restauration propre et produire les mêmes comptages.

Le code n'automatise pas encore un delta planifié. Pendant le parallèle :

- noter un point temporel UTC ;
- répéter les exports/snapshots complets ou filtrés quand la source le permet ;
- importer un nouveau lot ; les identifiants externes existants permettent de mettre à jour les cibles connues ;
- contrôler manuellement fusions, suppressions et archivages, qui ne sont pas propagés automatiquement ;
- conserver un journal des écritures effectuées dans chaque outil.

Ne pas créer une synchronisation bidirectionnelle temporaire : elle introduirait des conflits non gérés par le produit actuel.

## 10. Planning de bascule

### J-30 à J-8

- répétitions complètes réussies ;
- anomalies P0/P1 fermées ;
- utilisateurs formés ;
- formulaires Diskoov branchés en miroir puis testés ;
- procédure manuelle et restauration répétées ;
- dates de gel approuvées.

### J-7 à J-1

- export de sécurité ;
- rapprochement des dossiers ouverts, factures, paiements et stocks ;
- arrêt des changements de configuration dans les sources ;
- communication aux utilisateurs ;
- sauvegarde PostgreSQL/R2 de Diskoov ;
- décision go/no-go préliminaire.

### J0

1. Noter l'heure UTC du gel.
2. Interdire les écritures HubSpot/Extrabat ; conserver l'accès lecture si le contrat le permet.
3. Basculer le formulaire `diskoov.fr` vers `/api/public/leads` et tester une demande réelle maîtrisée.
4. Produire les exports finaux et les archiver.
5. Importer le dernier lot/delta.
6. Obtenir `VERIFIED`, puis effectuer les contrôles métier P0.
7. Faire signer le go/no-go commercial, opérations et finance.
8. Ouvrir Diskoov en écriture.
9. Conserver les anciens outils en lecture seule ; ne pas révoquer immédiatement les clés nécessaires à une vérification.

### J+1 à J+30

- rapprochement quotidien des leads, commandes, factures, paiements, stocks et SAV ;
- journal des incidents et corrections ;
- audit à J+7 puis J+30 ;
- aucun retour silencieux à une saisie métier dans l'ancien outil.

L'ordre recommandé est HubSpot puis Extrabat. Extrabat nécessite une période parallèle plus longue, au moins deux cycles opérationnels complets, car il porte les données de stock, chantier, SAV et finance.

## 11. Go/no-go

Le go exige toutes les preuves suivantes :

- rapport technique final `VERIFIED` pour chaque lot critique ;
- aucun écart non expliqué sur factures, paiements et stock ;
- archives finales lisibles et recopiées hors du compte source ;
- dix dossiers complets approuvés ;
- formulaires et prochaines actions opérationnels sans HubSpot ;
- devis → commande → acompte/solde et achats → réception → stock validés ;
- interventions/SAV exécutables sans Extrabat ;
- sauvegarde et rollback réalisés dans le temps attendu ;
- dépendances externes de la [matrice de couverture](coverage-and-external-dependencies.md) acceptées ou résolues ;
- signataires métier et technique nommés.

Un `VERIFICATION_FAILED`, une archive manquante, une facture non rapprochée, un stock incohérent ou l'impossibilité de restaurer impose un no-go.

## 12. Rollback de bascule

### Déclencheurs

- pertes ou doublons P0 ;
- écart financier/stock inexpliqué ;
- indisponibilité prolongée de l'application ;
- capture de leads non fiable ;
- impossibilité terrain/SAV non couverte par la procédure manuelle ;
- incident de sécurité.

### Procédure

1. Suspendre les nouvelles écritures Diskoov et arrêter le worker.
2. Noter l'heure et exporter le journal des opérations réalisées depuis J0.
3. Rebasculer le formulaire/site vers le canal de continuité validé.
4. Réouvrir temporairement l'ancien outil seulement sur décision du gérant.
5. Saisir dans l'ancien outil les opérations du journal, sous double contrôle.
6. Restaurer Diskoov depuis la sauvegarde pré-import dans une nouvelle base si les données sont corrompues.
7. Préserver la base défaillante et les archives pour diagnostic.
8. Corriger et refaire une répétition complète avant une nouvelle date.

Le rollback ne doit jamais être improvisé par suppression manuelle de lignes importées. Les objets d'un lot peuvent avoir mis à jour des enregistrements existants.

## 13. Résiliation et clôture

Résilier uniquement après :

- période d'observation convenue sans connexion métier à la source ;
- audit J+30 satisfaisant et, pour Extrabat, deux cycles opérationnels complets ;
- confirmation écrite de la durée d'accès et de suppression côté fournisseur ;
- copie finale des données, documents, configurations et rapports ;
- validation de l'expert-comptable pour les archives financières ;
- test de lecture des archives sans compte HubSpot/Extrabat ;
- révocation des clés et suppression des comptes temporaires ;
- conservation du procès-verbal, des rapports et empreintes selon la politique approuvée.

## 14. Procès-verbal minimal

| Élément | HubSpot | Extrabat |
|---|---|---|
| Lot final | — | — |
| Heure de gel UTC | — | — |
| Nombre d'archives / taille | — | — |
| Empreinte du rapport | — | — |
| Enregistrements importés/rejetés/exclus | — | — |
| Anomalies ouvertes acceptées | — | — |
| Contrôle commercial | nom/date | nom/date |
| Contrôle opérations/SAV | nom/date | nom/date |
| Contrôle finance | nom/date | nom/date |
| Test de restauration | preuve/date | preuve/date |
| Décision go/no-go | — | — |
| Décision de résiliation | — | — |

Joindre au procès-verbal les rapports JSON, manifestes, résultats de rapprochement et décisions d'exclusion. Ne jamais y joindre les clés d'accès.
