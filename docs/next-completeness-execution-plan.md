# Plan d’exécution — CRM/ERP complet et autonome

Date de référence : 26 août 2026  
Branche de travail : `codex/diskoov-crm-replacement`  
Objet : transformer le socle actuel en outil quotidien capable de remplacer les usages réels de HubSpot et d’Extrabat, sans identité d’entreprise codée en dur.

## 1. Décision produit

Le dépôt n’est plus un prototype : il contient 105 routes, 113 modèles Prisma et 227 actions serveur, avec CRM, vente, opérations, service, facturation, automatisations, communication, portail, migration et terrain hors ligne.

Le principal risque n’est donc plus l’absence d’écrans. Il est triple :

1. des fonctions existent mais restent moins profondes que leur équivalent métier ;
2. plusieurs pages concentrent trop de responsabilités et ne guident pas assez le travail quotidien ;
3. certaines promesses ne peuvent être finalisées sans comptes externes, données réelles ou décision du gérant.

La cible n’est pas de reproduire chaque option de HubSpot ou Extrabat. La cible est de couvrir, avec moins de friction, les processus effectivement utiles : acquisition, qualification, vente sur mesure, achat fabricant, planification, pose, facturation, SAV, entretien et fidélisation.

## 2. Sources officielles et enseignements

### HubSpot

- La [navigation HubSpot](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation) confirme les espaces CRM, Marketing, Sales, Commerce, Service, Automation, Reporting et Data Management.
- Les [séquences](https://knowledge.hubspot.com/sequences/create-and-edit-sequences) combinent e-mails automatiques, tâches manuelles, appels, délais en jours ouvrés, fenêtres d’envoi, désinscription sur réponse/rendez-vous, partage et analyse par étape.
- Les [workflows](https://knowledge.hubspot.com/workflows/create-workflows) proposent déclencheurs, réinscription, désinscription, actions, branches et représentation graphique.
- Le [help desk](https://knowledge.hubspot.com/help-desk/overview-of-the-help-desk-workspace) centralise e-mail, chat, formulaire, appels, WhatsApp et Messenger, puis ajoute routage, capacité, disponibilité, horaires et SLA.
- L’[espace Customer Success](https://knowledge.hubspot.com/customer-success/use-the-customer-success-workspace) rassemble portefeuille client, tâches, alertes, activité, rapports et santé client.
- Les [scores de santé](https://knowledge.hubspot.com/help-desk/customize-a-health-score-in-the-customer-success-workspace) combinent propriétés et événements pour détecter risque, opportunité et évolution.
- Les [pipelines configurables](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines) utilisent règles d’étape, propriétés conditionnelles, approbations, automatisations et accès par équipe.
- Les [objets personnalisés](https://knowledge.hubspot.com/object-settings/create-custom-objects) ajoutent propriétés, associations, pipelines et cartes de fiche configurables.
- Le [constructeur de rapports](https://knowledge.hubspot.com/reports/create-reports-with-the-custom-report-builder) combine sources, champs, filtres, ventilation, visualisation, sauvegarde et export.
- Les [e-mails marketing](https://knowledge.hubspot.com/marketing-email/create-and-send-marketing-emails) couvrent éditeur, segments, aperçu/test, programmation, automatisation et analyse.
- Les [préférences d’abonnement](https://knowledge.hubspot.com/marketing-email/set-up-email-subscription-types) distinguent les finalités de communication et l’opt-in par catégorie.
- Les [outils Commerce](https://knowledge.hubspot.com/get-started/collect-payments-with-commerce-tools) relient devis, factures, liens de paiement, abonnements, paiements et reporting.
- Les [outils de qualité des données](https://knowledge.hubspot.com/data-management/use-data-quality-tools) traitent doublons, formatage, enrichissement et usage des propriétés.

### Extrabat et métier terrain

- La page [Extrabat Piscine](https://www.extrabat.com/piscine/) confirme le cœur métier : CRM, documents, comptabilité, SAV, devis/factures, catalogues fournisseurs, signature, contrats, agenda, SMS/e-mailing, espace client, chantiers, statistiques, géolocalisation, caisse et bibliothèque.
- Extrabat met en avant la génération des commandes fournisseurs dès signature du devis et plus de 70 catalogues fournisseurs mis à jour.
- Le [planning chantier](https://servicescompris.extrabat.com/planning-chantier/) documente affectation, glisser-déposer, verrouillage, alertes, avancement coloré et bons de travaux comparant prévu/consommé avant sortie de stock.
- [Extrabat Today](https://www.extrabat.com/today/) confirme rapports terrain personnalisables, temps, photos, signatures, instructions et hors-ligne.
- [ExtraDoc](https://www.extrabat.com/extradoc/) confirme bibliothèque et porte-documents client accessibles et partageables en mobilité.
- [SimplyMeet](https://www.extrabat.com/simplymeet/) confirme prise de rendez-vous publique et synchronisation d’agenda.

### Parcours métier cible

Le site public de l’entreprise cible présente une vente conseil de couvertures sur mesure, plusieurs fabricants, une visite d’implantation, fabrication/livraison/pose, garanties et SAV dans plusieurs régions. Cela implique notamment : qualification géographique, visite technique, configurateur par fabricant, documents techniques, coordination fournisseur, planification terrain, preuve de pose, parc installé, garantie, maintenance et service réactif.

## 3. Matrice d’écarts priorisée

| Domaine | Existant | Écart principal | Priorité |
|---|---|---|---|
| Modèle CRM | clients, contacts, leads, champs JSON, associations métier codées | propriétés configurables, associations étiquetées, historique de propriété, fusion et vues sauvegardées | P0 |
| Vues de listes | recherche et filtres ponctuels | filtres composables, colonnes, tri, pagination, sélection et actions en masse persistées par utilisateur | P0 |
| E-mail individuel | envoi/réception Resend, fils, événements, aperçu | vraie boîte Google/Microsoft, pièces jointes, brouillons, destinataires multiples, signature utilisateur, recherche | P0 externe/produit |
| Séquences | modèles, délais, inscriptions, arrêt sur réponse | tâches/appels, jours ouvrés, fenêtres horaires, A/B, version, performance par étape, limite d’envoi | P0 |
| Workflows | déclencheurs et actions linéaires | branches si/alors, temporisations, objectifs, versions, test sur enregistrement, reprise et éditeur graphique | P0 |
| Rendez-vous | tâches, demandes portail, ICS | pages de réservation, disponibilités, rappels, confirmation/annulation, Google/Microsoft bidirectionnel | P0 externe/produit |
| Pipeline | opportunités, propriétaire, probabilité, motif de perte, forecast du mois | pipelines configurables, règles d’étape, approbations, quotas, périodes, vélocité et forecast engagé/meilleur cas | P0 |
| Marketing | campagnes, assets, UTM, segments | e-mail collectif réel, destinataires/exclusions, programmation, test, préférences, A/B et attribution | P0/P1 |
| Service | tickets, files, échéance, détail, interventions | conversation dans le help desk, macros, fusion, routage/capacité, horaires ouvrés et SLA contractuels | P0 |
| Customer Success | CSAT/NPS/CES et score relation simple | portefeuille, score de santé configurable, alertes, plans de succès, renouvellements et opportunités d’extension | P1 |
| Connaissance | articles, tags, visibilité, portail | éditeur riche, versions, approbation, pièces, recherche plein texte, suggestions et statistiques d’usage | P1 |
| Catalogue métier | produits, options, nomenclature, prix | import/version fournisseur, règles dimensionnelles, compatibilités, documents, pièces détachées et alternatives | P0 |
| Achats | commandes, approbation, réception, anomalies/retours | génération automatique depuis commande client, relances, dates confirmées en masse et portail/EDI fournisseur | P0/P1 |
| Stock | dépôts, mouvements, réservations | inventaires, transferts, lots/séries, valorisation, seuils/actions, substitutions et traçabilité des pièces | P1 |
| Planning | interventions, charge, conflits, tournée chronologique | calendrier jour/semaine, glisser-déposer, verrouillage, compétences, absences, trajets et optimisation | P0 |
| Bon de travaux | rapport, consommé, frais, signature | comparaison prévu/réel visuelle, ajout hors devis avec justification, validation responsable et écarts de marge | P0 |
| Chantiers | modèles, jalons, dépendances, recette | Gantt, charge, budget engagé/réel, journal, risques, sous-traitants et marge finale | P0/P1 |
| Contrats | signature et entretien périodique | renouvellement, révision tarifaire, préavis, alertes, avenants et signature de renouvellement | P0 |
| Finance | devis, facture, avoir, paiement, récurrence | paiement en ligne, relances envoyées, échéancier, trésorerie prévisionnelle et e-facturation via PA/PDP | P0 externe/produit |
| Comptabilité | journal applicatif, banque CSV | règles de rapprochement, flux bancaire, export cabinet validé, TVA et clôture de période | P1 externe/produit |
| Reporting | tableaux fixes | constructeur de rapports, dashboards sauvegardés, objectifs, drill-down, partage et envoi planifié | P0/P1 |
| GED | fichiers et stockage privé | dossiers/tags, versions, recherche OCR/plein texte, liens, conservation, modèles et bibliothèque fabricant | P1 |
| Données | import HubSpot/Extrabat, mappings, rapports | vraie migration générale, delta, pièces jointes, dédoublonnage interactif et rapprochement signé | P0 externe |
| Administration | rôles par domaine, invitations, audit backend | permission par équipe/dossier, MFA, récupération, sessions, journal UI et centre de sécurité | P0/P1 |
| Exploitation | health checks, CI, export de réversibilité | providers réellement configurés, alerting, PITR, restauration mesurée, SLO et procédure incident testée | P0 externe |

## 4. Architecture fonctionnelle cible

### 4.1 CRM et données configurables

Nouvelles capacités :

- définitions de propriétés par objet : texte, nombre, devise, date, option, multi-option, utilisateur, calcul ;
- groupes de propriétés et ordre d’affichage ;
- valeur, historique, source et auteur de chaque modification ;
- libellés d’association : décideur, payeur, installateur, fabricant, prescripteur ;
- vues sauvegardées personnelles/équipe avec colonnes, filtres et tri ;
- actions en masse : propriétaire, étape, séquence, tâche, export, archivage ;
- détection et fusion de doublons avec aperçu des valeurs conservées ;
- règles de formatage et tableau de qualité par objet ;
- pipelines configurables pour leads, opportunités, projets et tickets ;
- champs obligatoires, validations et approbations par étape.

Critères d’acceptation : aucune valeur d’une autre société accessible ; modification de configuration auditée ; fusion réversible par export préalable ; listes utilisables sur 10 000 enregistrements sans tout charger côté client.

### 4.2 E-mail, agenda et communications

Nouvelles capacités :

- connecteurs OAuth Google Workspace et Microsoft 365 ;
- synchronisation incrémentale et curseur par boîte ;
- rattachement automatique des messages aux contacts, clients, affaires et tickets ;
- composeur avec To/Cc/Cci, pièces jointes, signature, brouillon et réponse dans le fil ;
- boîte partagée avec affectation, statut, collision de réponse et recherche ;
- pages de réservation avec durée, tampon, fuseau, disponibilité et questions ;
- événements calendrier bidirectionnels et rappels ;
- centre de préférences par finalité e-mail/SMS ;
- SMS transactionnel pour rendez-vous, intervention et contrat, après choix d’un fournisseur.

Gate externe : applications OAuth, consentement administrateur, domaines, webhooks et comptes de recette sont requis. Sans ces éléments, le produit doit afficher « non configuré », jamais simuler une connexion.

### 4.3 Séquences et automatisations

Nouvelles capacités :

- étapes e-mail automatique, e-mail manuel, appel, tâche, notification, changement de champ et webhook ;
- délais calendaires ou ouvrés, fenêtre d’envoi et fuseau du destinataire ;
- branche si/alors, plusieurs branches, délai jusqu’à une date/propriété et objectif de sortie ;
- inscription, réinscription, suppression, limite de fréquence et liste d’exclusion ;
- version brouillon/publiée avec comparaison et restauration ;
- test sur un enregistrement sans effet externe ;
- aperçu du chemin, compteur attendu par branche et validation avant activation ;
- journal pas à pas, reprise d’une étape, annulation et raison d’échec ;
- A/B des objets/contenus de séquence et statistiques par étape ;
- modèles de workflows métier : nouveau lead, devis accepté, commande fournisseur, intervention terminée, ticket clos, contrat à renouveler.

### 4.4 Ventes et CPQ métier

Nouvelles capacités :

- espace de prospection avec file quotidienne, tâches en lot et priorité ;
- comptes cibles, décisionnaires et couverture relationnelle ;
- forecast par mois/trimestre, catégories pipeline/engagé/meilleur cas, quotas et écarts ;
- historique des changements d’étape et vélocité ;
- approbation de remise/marge et règles de prix ;
- configurateur dimensionnel par gamme/fabricant ;
- compatibilités et exclusions d’options ;
- bibliothèque de documents techniques et brochures associées ;
- comparaison de versions de devis ;
- échéancier acompte/intermédiaires/solde ;
- avenant commercial après signature.

### 4.5 Opérations métier et terrain

Nouvelles capacités :

- génération contrôlée des besoins et commandes fournisseur depuis la commande client ;
- regroupement par fournisseur, reliquat et date nécessaire chantier ;
- import catalogue versionné, aperçu des variations de prix et activation différée ;
- planning jour/semaine/mois avec déplacement accessible et verrouillage ;
- compétences, zones, véhicules, absences et capacité ;
- carte, géocodage et proposition de tournée lorsque le fournisseur est choisi ;
- Gantt chantier, chemin critique, risques, blocages et journal de chantier ;
- bon de travaux prévu/réel : temps, articles, photos, frais, réserves et justification d’écart ;
- inventaire tournant, transfert inter-dépôts, lots/séries et scan code-barres ;
- rattachement des pièces consommées à l’équipement installé ;
- sous-traitants, ordre de travail, document attendu et validation ;
- marge chantier : vendu, acheté, stock consommé, temps, frais, reste à engager et reste à facturer.

### 4.6 Service, maintenance et fidélisation

Nouvelles capacités :

- help desk en trois panneaux : files, conversation, contexte client ;
- réponse e-mail depuis le ticket, pièces jointes, note interne, mention et collision ;
- macros, snippets et articles suggérés ;
- fusion/scission de tickets et détection de doublon ;
- routage par compétence, territoire, charge et disponibilité ;
- calendrier ouvré, jours fériés, SLA première réponse/résolution et pause en attente client ;
- diagnostics guidés par gamme, symptômes, garantie et historique ;
- contrat d’entretien avec renouvellement, préavis, indexation et avenant ;
- score de santé configurable combinant tickets, NPS, retards, activité et contrat ;
- alertes de risque, plan de succès, prochaine action et opportunité d’extension ;
- déclenchement automatique des enquêtes, relance unique et alerte sur mauvaise note ;
- éditeur riche de connaissance, versions, approbation et analytics recherche/lecture/utilité.

### 4.7 Finance et conformité

Nouvelles capacités :

- échéanciers et demandes d’acompte ;
- liens de paiement et rapprochement automatique via prestataire choisi ;
- relances réellement envoyées, scénarios par retard, pause et journal ;
- prévision de trésorerie par échéances clients/fournisseurs ;
- marge par affaire, chantier, produit, fabricant et commercial ;
- avoir partiel par ligne, remboursement et lettrage ;
- réception de factures fournisseurs et circuit de validation ;
- connecteur de facturation électronique via plateforme agréée ;
- export comptable validé par le cabinet, périodes verrouillées et contrôles TVA.

### 4.8 Reporting et pilotage

Nouvelles capacités :

- catalogue de sources et champs reportables ;
- constructeur : métrique, dimension, période, filtres, regroupement et calcul ;
- graphiques table, KPI, ligne, barre, entonnoir et cohortes ;
- drill-down vers les enregistrements ;
- dashboards personnels/équipe, déplacement et redimensionnement ;
- objectifs par utilisateur/équipe et suivi de progression ;
- envoi planifié PDF/CSV ;
- modèles : acquisition, vélocité pipeline, forecast, conversion devis, marge chantier, ponctualité fournisseur, SLA, satisfaction, renouvellement et trésorerie.

## 5. Refonte et amélioration page par page

### Socle partagé

- Ajouter un bandeau de contexte cohérent : titre, description courte, actions, aide et état de synchronisation.
- Standardiser filtres, recherche, sélection, colonnes, pagination, vues sauvegardées et export.
- Remplacer les formulaires HTML très longs par sections progressives avec résumé collant.
- Ajouter validation au champ, résumé d’erreurs, protection contre fermeture avec brouillon non sauvegardé et confirmations descriptives.
- Généraliser skeletons, erreurs de section avec reprise et états vides pédagogiques.
- Garantir cibles tactiles de 44 px, focus visible, libellés accessibles, contraste AA et navigation clavier.
- Décomposer les composants supérieurs à 500 lignes ; `organisation-view.tsx`, `temps-view.tsx`, `settings-client.tsx` et `operations-center.tsx` sont prioritaires.
- Remplacer les couleurs ponctuelles et motifs isolés par des tokens sémantiques.

### Accueil `/dashboard`

- Personnalisation par rôle et widgets configurables.
- Période globale, comparaison, fraîcheur des données et drill-down.
- Bloc « à faire aujourd’hui » unifié : leads, devis, achats, interventions, tickets, paiements.
- Alertes explicables et masquables, sans répétition de cartes statistiques.

### CRM `/dashboard/crm`, clients, contacts et leads

- Listes en table dense avec vues sauvegardées, colonnes et actions en masse.
- Fiche client à trois zones : identité/score, chronologie centrale, associations et prochaines actions.
- Édition inline des propriétés et historique par propriété.
- Fusion de doublons et qualité de coordonnées.
- Fiche contact avec consentements, séquences, fils, rendez-vous et rôle dans les affaires.
- File prospect avec raccourcis clavier, tâches en lot et passage à l’enregistrement suivant.

### Communications

- Vue trois panneaux avec fils, message et contexte CRM.
- Composeur HTML visuel, version texte, aperçu desktop/mobile et envoi test.
- Pièces jointes, brouillons, Cc/Cci, signature et recherche.
- Chronologie livraison/ouverture/clic/réponse et explication des taux.
- Écran intégrations séparé avec diagnostic réel, scopes, dernière synchro et actions de reconnexion.

### Marketing, campagnes et segments

- Calendrier de campagne, jalons, responsables et validations.
- Véritable actif « e-mail marketing » avec audience, exclusions, test, programmation et résultats.
- Constructeur de segment lisible en groupes ET/OU avec estimation avant sauvegarde.
- Attribution par UTM et conversion jusqu’au devis/commande, avec limites clairement indiquées.
- Préférences par type de communication et centre public associé.

### Automatisations et séquences

- Séparer bibliothèque de modèles, séquences, workflows et journal.
- Remplacer le formulaire compact par un éditeur en canevas avec panneau de configuration.
- Ajouter version, test, publication, erreurs de validation et métriques par nœud.
- Vue des inscriptions avec état, prochaine étape, raison de sortie et action pause/reprise.

### Ventes, pipeline et organisation

- Barre de contrôle du pipeline : pipeline, propriétaire, période, équipe, vue et forecast.
- Colonnes avec montant, pondéré, âge et limite de travail en cours.
- Fiche affaire avec carte des interlocuteurs, plan mutuel, activité et pièces commerciales.
- Workspace commercial quotidien regroupant activités, séquences, tâches et réunions.
- Calendrier organisation en vues agenda/semaine/mois, files de tâches et disponibilité.

### Devis, contrats et catalogue

- Comparaison de versions, commentaires, approbation et historique de consultation.
- Résumé de marge et alertes avant envoi.
- Éditeur de documents à structure stable, aperçu toujours visible et contrôle mobile.
- Catalogue avec import fournisseur, versions de tarifs, compatibilités et documents.
- Contrats avec échéances, avenants, renouvellements et alertes.

### Projets, opérations, achats et stock

- Scinder le centre opérationnel en pages dédiées : planning, commandes clients, achats, stock, sites et contrats.
- Préserver un cockpit transversal uniquement pour les alertes et raccourcis.
- Gantt chantier et vue charge côte à côte.
- Page achat avec étapes visuelles, communication fournisseur et reliquats.
- Page stock avec inventaire, transferts, valorisation et mouvements filtrables.
- Dossiers fournisseur avec score qualité/délai, incidents et évolution des prix.

### Terrain

- Écran « aujourd’hui » priorisé, accès hors ligne visible et synchronisation explicable.
- Checklist d’arrivée, sécurité, relevé, réalisation, contrôle et départ.
- Comparatif prévu/réel avant signature.
- Compression photo, reprise d’upload, scan produit et brouillon par section.
- Blocage de clôture explicite avec liste des éléments manquants.

### Service

- Help desk conversationnel, réponse sans quitter le ticket et contexte complet.
- Compteurs première réponse/résolution, horloge ouvrée et raison de pause.
- Ticket : diagnostic, conversation, interventions, pièces, contrat, garantie, enquêtes et résolution.
- Parc installé : arborescence client/site/équipement, documents, pièces, incidents et maintenance.
- Connaissance : éditeur riche, sommaire, versions, approbation et aperçu portail.
- Satisfaction : courbes, distribution, filtres, verbatims, alertes et actions de suivi.

### Revenus, factures, banque et comptabilité

- Cockpit encaissement avec échéances, retards, relances et prévision.
- Facture : chronologie émission/envoi/lecture/paiement/avoir.
- Relances configurables et bouton d’envoi réel avec aperçu.
- Banque : règles, rapprochement en lot et score de suggestion.
- Comptabilité : périodes, contrôles, exports identifiés et état de validation cabinet.

### Reporting

- Remplacer les chiffres fixes par dashboards filtrables et sauvegardés.
- Ajouter définitions de métrique et source de chaque nombre.
- Drill-down systématique et export cohérent avec le filtre visible.

### Paramètres, équipe, données et migration

- Paramètres séparés : entreprise, documents, ventes, service, finance, données, intégrations, sécurité.
- Équipe : matrice des droits, groupes, territoires, compétences, coût/capacité et journal d’accès.
- Données : qualité, doublons, propriétés, pipelines, sauvegarde et audit.
- Migration : assistant par source, mapping enregistré, échantillon, anomalies corrigeables, delta et rapprochement final.

## 6. Lots d’implémentation

### Lot A — fondations UX et listes configurables (P0)

Durée indicative : 2 à 3 semaines.

- composant commun de vue sauvegardée ;
- filtres/colonnes/tri/pagination/actions en masse ;
- propriétés configurables v1 et historique ;
- tables clients, contacts, leads, opportunités, tickets, factures ;
- skeletons/erreurs manquants ;
- découpage des quatre composants monolithiques prioritaires.

Gate : tests de permissions, pagination et mobile ; aucun écran ne charge une liste entière sans borne.

### Lot B — automatisations et séquences professionnelles (P0)

Durée indicative : 3 à 4 semaines.

- modèle de graphe versionné ;
- branches, tâches/appels, horaires ouvrés, objectifs et exclusions ;
- éditeur visuel et test sans effet ;
- journal/rejeu ;
- statistiques par étape ;
- modèles métier.

Gate : moteur idempotent, simulation déterministe, limite de fréquence et preuve d’arrêt sur opposition/réponse.

### Lot C — communication et rendez-vous (P0)

Durée indicative : 3 à 5 semaines plus validation externe.

- composeur complet et boîte partagée ;
- pièces jointes et brouillons ;
- réservation publique ;
- OAuth Google/Microsoft ;
- synchronisation mail/calendrier ;
- SMS transactionnel après choix fournisseur.

Gate : scopes minimaux, révocation, reprise incrémentale, test réel entrant/sortant et aucune donnée factice.

### Lot D — vente, CPQ et forecast (P0)

Durée indicative : 3 à 4 semaines.

- pipelines configurables et règles d’étape ;
- forecast multi-périodes et quotas ;
- espace de prospection ;
- règles de prix/remise/marge ;
- configurateur dimensionnel et versions de devis ;
- échéanciers/avenants.

Gate : dix configurations métier réelles recalculées côté serveur avec résultats signés par le gérant.

### Lot E — opérations pisciniste avancées (P0)

Durée indicative : 4 à 6 semaines.

- import catalogues fabricants ;
- besoins/commandes automatiques ;
- planning semaine avec verrouillage ;
- prévu/réel terrain ;
- Gantt et marge chantier ;
- inventaires/transferts/séries ;
- pièces par équipement.

Gate : deux cycles complets commande → achat → réception → pose → stock → marge, sans double mouvement.

### Lot F — service et fidélisation avancés (P0/P1)

Durée indicative : 3 à 4 semaines.

- help desk conversationnel ;
- SLA ouvrés, routage et capacité ;
- diagnostics/macros ;
- santé client et portefeuille ;
- renouvellements ;
- connaissance versionnée ;
- enquêtes automatiques et boucle de rattrapage.

Gate : ticket entrant réel, première réponse, intervention, résolution, enquête et action de suivi traçables.

### Lot G — finance, reporting et administration (P0/P1)

Durée indicative : 4 à 6 semaines plus fournisseurs externes.

- relances envoyées et paiement en ligne ;
- trésorerie et marges ;
- facturation électronique ;
- constructeur de rapports et dashboards ;
- MFA/récupération/sessions ;
- audit UI, sécurité et restauration.

Gate : validation expert-comptable, paiement de recette remboursé, dashboard rapproché aux écritures et restauration chronométrée.

### Lot H — migration générale et bascule (P0 externe)

Durée indicative : dépend des exports et de leur qualité.

- inventaire signé des comptes sources ;
- extraction brute complète ;
- migration à blanc 1 ;
- correction mappings/doublons ;
- migration à blanc 2 identique ;
- parallèle opérationnel ;
- delta final ;
- rapprochement volumes/montants/relations/documents ;
- PV go/no-go ;
- résiliation seulement après validation.

## 7. Dépendances externes à ne pas confondre avec du code manquant

| Dépendance | Nécessaire pour | Entrée attendue |
|---|---|---|
| HubSpot privé | inventaire et extraction complète | jeton privé, scopes, exports et liste des objets/workflows réellement utilisés |
| Extrabat | restitution complète | exports, GED, identifiants stables, documentation/API autorisée du compte |
| Google/Microsoft | mail et calendrier historiques | choix fournisseur, application OAuth et consentement administrateur |
| SMS | notifications et rappels | fournisseur, numéro, consentement et modèle de coût |
| Paiement | liens et prélèvements | Stripe ou autre prestataire, compte et politique de remboursement |
| Facturation électronique | émission/réception réglementaire | plateforme agréée et contrat |
| Catalogues fabricants | CPQ et prix | fichiers/API, droits d’usage, version et fréquence de mise à jour |
| Cartographie | géocodage et tournées | fournisseur, quota, coût et politique de données |
| Production | continuité | PostgreSQL PITR, R2, Redis/Upstash, Resend, supervision et alertes |

## 8. Définition de « terminé »

Une fonction n’est pas terminée parce qu’un écran existe. Elle est terminée lorsque :

- le parcours heureux et les erreurs sont gérés ;
- permissions et isolement société sont testés ;
- mutation auditée et rejouable lorsque nécessaire ;
- état vide, chargement, erreur et mobile sont couverts ;
- données exportables et incluses dans la réversibilité ;
- migration PostgreSQL sans dérive ;
- test unitaire du calcul et E2E du parcours critique ;
- documentation utilisateur et exploitation à jour ;
- dépendance externe affiche son état réel ;
- critère métier validé sur un dossier représentatif.

## 9. Ordre immédiat recommandé

1. Fondations de vues sauvegardées et propriétés configurables.
2. Séquences professionnelles : tâches, horaires ouvrés, métriques par étape.
3. Workflows à branches versionnés et testables.
4. Help desk conversationnel et SLA ouvrés.
5. Planning semaine verrouillable et prévu/réel terrain.
6. Catalogue fournisseur versionné et génération de besoins d’achat.
7. Forecast, quotas et marge affaire/chantier.
8. Connecteurs Google/Microsoft dès que les identifiants OAuth sont disponibles.
9. Reporting configurable.
10. Migration à blanc dès réception des exports réels, en parallèle des lots produit.

Cet ordre maximise la valeur quotidienne sans bloquer le développement sur les intégrations externes, tout en préparant la seule preuve qui autorisera réellement la résiliation : une bascule complète, rapprochée et réversible.

## 10. Avancement du checkpoint en cours

Premier sous-lot livré :

- modèle `SavedView` multi-tenant, personnel ou équipe ;
- configuration JSON validée côté serveur et borne des ressources ;
- droits de lecture/écriture et inclusion dans la sauvegarde/réversibilité ;
- barre « Vue enregistrée » intégrée à la liste Clients ;
- test navigateur création → rechargement → réapplication ;
- correction des avertissements d’accessibilité Base UI sur plusieurs liens-boutons ;
- correction des clés React dupliquées dans les hubs et sous-menus.

Extension livrée dans ce checkpoint : la barre est également active sur Contacts (recherche + consentement) et Devis (recherche), avec couverture navigateur de la persistance après rechargement.

Prochaine extension du même lot : appliquer la barre aux Prospects, Pipeline, Factures, Tickets, Projets et Achats, puis ajouter colonnes, tris, filtres composables et actions en masse.

Deuxième sous-lot livré :

- jours ouvrés activables par séquence ;
- fenêtre horaire d’exécution et fuseau IANA ;
- calcul de prochain créneau appliqué à l’inscription, aux étapes suivantes et aux reprises après erreur ;
- métriques livrés, ouverts, cliqués et erreurs pour chaque étape ;
- validation serveur, contrainte PostgreSQL et tests des soirées/week-ends ;
- parcours navigateur de modification et persistance de la cadence.

Troisième sous-lot livré :

- étapes e-mail manuel, appel et tâche générale dans les séquences ;
- création idempotente dans le module Organisation existant ;
- titre et consignes personnalisables avec variables CRM ;
- priorité et rattachement au client ;
- pause facultative jusqu’à réalisation ;
- reprise atomique de l’inscription lorsque la tâche est terminée ;
- indicateurs de tâches créées/terminées dans la séquence ;
- fonctionnement des tâches manuelles même si le fournisseur e-mail n’est pas configuré ;
- parcours navigateur séquence → appel → Organisation → réalisation → séquence terminée.

Prochaine extension Automatisation : version brouillon/publiée, test sans effet, branches conditionnelles et journal détaillé par action.
