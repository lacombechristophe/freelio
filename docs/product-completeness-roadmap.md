# Feuille de route de complétude CRM/ERP

Date de référence : 26 août 2026
Portée : benchmark officiel HubSpot, Extrabat Piscine, activité de vente/pose/SAV de couvertures et abris de piscine, et état réel du dépôt.

## 1. Principe

L'objectif n'est pas de copier chaque écran d'HubSpot ou d'Extrabat. Le produit doit couvrir, avec une meilleure continuité, les parcours réellement nécessaires : acquisition → qualification → visite technique → configuration/devis → commande fabricant → pose → facturation → SAV/entretien → fidélisation.

Une fonctionnalité n'est considérée comme disponible que si elle possède : modèle de données, règles serveur, interface exploitable, permissions, journalisation pertinente, états vides/erreurs et preuve automatisée.

## 2. Architecture de navigation cible

| Espace | Sous-espaces |
|---|---|
| Accueil | vue d'ensemble, tâches du jour, alertes, favoris |
| CRM | vue CRM, clients, contacts, prospects, affaires, activités, boîte de réception |
| Marketing | vue marketing, campagnes, e-mails, formulaires, segments, scoring, automatisations, analyses |
| Ventes | espace commercial, pipeline, rendez-vous, devis, contrats, catalogue/configurateur, prévisions |
| Opérations | centre opérationnel, chantiers, planning, terrain, temps, achats, stock, livraisons |
| Service | help desk, tickets, interventions, parc installé, contrats d'entretien, portail, base de connaissances, satisfaction |
| Revenus | vue revenus, factures, abonnements/récurrences, paiements, dépenses, banque, comptabilité, e-facturation |
| Données | qualité, imports/migrations, propriétés, intégrations, audit, sauvegardes |
| Reporting | tableaux de bord, rapports, objectifs, attribution, rentabilité |
| Administration | équipe, rôles, notifications, paramètres, aide |

Cette structure reprend le principe des espaces HubSpot sans reprendre sa présentation : les modules fréquents restent accessibles en deux actions maximum, les favoris sont personnels et les espaces ouverts suivent la page active.

## 3. Benchmark HubSpot

Source principale : [guide officiel de navigation HubSpot](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation).

### CRM et ventes

- fiches contacts, entreprises, affaires et tickets personnalisables ;
- listes/vues sauvegardées, actions de masse et propriétés personnalisées ;
- chronologie omnicanale et association entre tous les objets ;
- espace commercial avec file d'actions quotidienne ;
- séquences, modèles, snippets et suivi documentaire ;
- liens de rendez-vous et disponibilité calendrier ;
- appels, journalisation, enregistrement/transcription et coaching ;
- prévisions, quotas, objectifs, vélocité et analyses par commercial ;
- CPQ, validation de devis, engagement du destinataire et paiements.

### Marketing

- campagnes regroupant e-mails, formulaires, CTA, contenus, publicités et tâches ;
- éditeur e-mail visuel, programmation, tests A/B et contrôle avant envoi ;
- segments actifs/statiques, exclusions, fréquence et consentements ;
- formulaires configurables, champs progressifs et historique des soumissions ;
- parcours/journeys et workflows à branches ;
- attribution multi-touch, ROI, buyer intent et analyses de parcours ;
- SMS, social, publicités, événements et contenu/SEO.

### Service

- help desk omnicanal et routage selon capacité/compétence ;
- SLA de première réponse/résolution et calendriers ouvrés ;
- base de connaissances, portail et agent conversationnel ;
- enquêtes NPS, CSAT, CES et boucle de suivi ;
- customer success workspace, health score, renouvellements et opportunités d'upsell ;
- analyses par file, canal, agent, priorité et motif.

### Données, automatisations et reporting

- centre de qualité des données, doublons, normalisation et enrichissement ;
- modèle de données et propriétés personnalisées administrables ;
- synchronisations bidirectionnelles et suivi d'erreurs ;
- workflows versionnés, testables, observables et rejouables ;
- constructeur de rapports et tableaux de bord personnalisables ;
- objectifs partagés et permissions fines par équipe/objet/champ.

## 4. Benchmark Extrabat Piscine

Sources : [Extrabat Piscine](https://www.extrabat.com/piscine/), [offres Extrabat](https://www.extrabat.com/tarifs/) et [applications Extrabat](https://www.extrabat.com/marketplace/).

### Commerce et catalogue

- bibliothèques fabricants mises à jour, tarifs d'achat/vente et formules dimensionnelles ;
- devis configurés par gamme, variantes, options, cotes et travaux préparatoires ;
- documents paramétrables, signature et envoi multicanal ;
- commandes fournisseurs déclenchées depuis le devis signé ;
- échéancier d'acompte/solde et rentabilité prévisionnelle.

### Chantiers et mobilité

- agenda partagé/synchronisé, plan de charge et affectations ;
- jalons, dépendances, ressources, documents, photos et compte rendu ;
- géolocalisation, carte et tournées ;
- applications mobiles terrain, documents hors connexion et signature ;
- notifications/SMS client avant intervention ;
- prise de cotes métier et contrôles de faisabilité.

### SAV et contrats

- parc installé, garanties, numéros de série, notices et pièces ;
- tickets, priorités, diagnostic, historique et interventions ;
- contrats de service, échéances, renouvellements et facturation ;
- rapports signés avec photos ;
- portail client, demandes de rendez-vous et documents.

### Gestion

- achats, réceptions, retours, stocks, inventaires et transferts ;
- banque, règlements, relances, TVA et export comptable ;
- émission/réception de factures électroniques ;
- bibliothèque documentaire mobile ;
- statistiques, exports, caisse et marketplace.

## 5. Adaptation au métier couvertures/abris de piscine

Le site de l'entreprise met en avant des solutions sur mesure, plusieurs fabricants, la visite technique, la pose incluse, les garanties et un SAV réactif. Le CRM doit donc approfondir en priorité :

1. catalogue par fabricant et famille (couverture tendue, volet, bâche, abri, terrasse mobile) ;
2. règles de compatibilité selon dimensions, forme, accès, margelles, terrasse, alimentation et travaux préparatoires ;
3. visite initiale, relevé technique définitif et validation fabricant ;
4. devis comparatif avec options, photos, plans, brochures et normes de sécurité ;
5. commande usine, accusé, délai, livraison, préparation et pose ;
6. communication proactive au client à chaque jalon ;
7. réception/signature, garanties, notices et parc installé ;
8. SAV avec diagnostic produit/fabricant et pièces ;
9. rentabilité par dossier, fabricant, commercial, région et gamme ;
10. couverture géographique PACA, Occitanie et Rhône-Alpes pour les tournées et prévisions.

## 6. État réel et priorités

### P0 — nécessaire avant résiliation

- vraies connexions Google Workspace/Microsoft 365 : OAuth, synchronisation incrémentale, envoi, réponses et calendriers ;
- activation Resend/R2/Upstash et supervision de production ;
- récupération de mot de passe, MFA optionnelle et révocation de sessions ;
- reprise réelle et rapprochée des données/archives HubSpot et Extrabat ;
- fiches détaillées des objets principaux et historique unifié ;
- e-facturation via plateforme compatible et export comptable validé ;
- sauvegardes natives, restauration et alertes.

### P1 — profondeur fonctionnelle attendue

- campagnes marketing, envois collectifs, validations, programmation et A/B ;
- workflows à branches, versions, tests, horaires ouvrés et reprise ;
- rendez-vous synchronisés et rappels SMS/e-mail ;
- help desk, SLA, files, modèles de réponse, base de connaissances et satisfaction ;
- plan de charge/Gantt, carte et tournées ;
- inventaires/transferts/valorisation, pièces et numéros de série ;
- marges et rentabilité complètes ;
- constructeur de rapports et tableaux de bord sauvegardés ;
- propriétés, pipelines et vues configurables.

### P2 — selon usage confirmé

- téléphonie/VoIP, transcription et coaching ;
- WhatsApp, SMS bidirectionnel, live chat et chatbot ;
- publicités/social/SEO/contenu ;
- caisse magasin ;
- RH, congés et paie ;
- configurateur ou plan 3D ;
- avis client et e-réputation.

## 7. Découpage d'implémentation

1. **Architecture produit** : navigation, pages-hubs, favoris, vues et recherches.
2. **Profondeur CRM/Ventes** : contacts, affaires, activités, rendez-vous et prévisions.
3. **Marketing** : campagnes, éditeur, audiences, diffusion et attribution.
4. **Service** : help desk, SLA, connaissance, satisfaction et renouvellements.
5. **ERP métier** : catalogue fabricant, planification, achats/stock et rentabilité.
6. **Données/intégrations** : OAuth, qualité, migration, audit et observabilité.
7. **Bascule** : migrations à blanc, parallèle, delta final et PV de résiliation.

Chaque lot doit conserver le build, les tests unitaires, les migrations PostgreSQL sans dérive et les scénarios Playwright critiques au vert avant push et déploiement.

## 8. Avancement vérifiable

Livré dans le produit :

- navigation par espaces, sous-menus, favoris personnels, recherche globale et pages-hubs alimentées par les données réelles ;
- fiches unifiées contact et opportunité, avec associations client, interlocuteurs, devis, chantiers, origine et chronologie commerciale ;
- dossiers SAV, intervention, équipement, fournisseur et commande d'achat, reliés entre eux et aux clients/chantiers ;
- centre de support filtrable avec propriétaire, charge, priorité, engagement de résolution explicite, dépassement et règles testées ;
- résolution SAV documentée obligatoire, preuves terrain, signature, pièces, coûts réels, réserves, garantie, anomalies fournisseur et retours ;
- campagnes marketing structurées, assets, audiences, budgets, UTM, séquences et métriques d'attribution.

Toujours bloquant avant résiliation : connecteurs OAuth réels et recette des boîtes/calendriers, activation des fournisseurs de production, migrations à blanc sur les exports réels, e-facturation agréée, sauvegarde/restauration mesurée, puis recette métier et procès-verbal de bascule.
