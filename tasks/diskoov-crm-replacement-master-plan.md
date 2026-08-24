# Plan directeur — CRM/ERP Diskoov sans HubSpot ni Extrabat

Date de création : 23 août 2026
Dernière mise à jour : 24 août 2026
Statut : plan directeur actif — socle et cœur métier largement implémentés, remplacement opérationnel non encore certifié
Décision : remplacer complètement HubSpot et Extrabat par le CRM Diskoov issu de Freelio.

## 1. Décision et objectif

La cible n'est plus un cockpit connecté à HubSpot et Extrabat. Le futur CRM Diskoov devient l'unique source de vérité pour le prospect, le client, la vente, le chantier, le SAV et la facturation. HubSpot sera résilié en premier ; Extrabat sera résilié après validation complète des opérations terrain et financières.

L'objectif économique correct est **zéro licence HubSpot et zéro licence Extrabat**, pas zéro coût informatique. Une application métier fiable conservera des coûts récurrents incompressibles : hébergement, base de données, stockage et sauvegardes, supervision, e-mails transactionnels, SMS, cartes/géocodage et, selon les choix, signature de confiance et plateforme agréée de facturation électronique.

Le projet est réussi lorsque Diskoov peut acquérir un prospect, vendre, commander, planifier, installer, facturer, encaisser et gérer le SAV sans ouvrir HubSpot ni Extrabat, avec un historique complet et auditable.

## 2. Inventaire de l'existant — Freelio v2

Le dépôt actuel est un CRM/ERP Diskoov fonctionnel en cours de recette. Les listes ci-dessous décrivent le code présent ; elles ne remplacent pas la validation sur les comptes et processus réels.

### 2.1 Capacités déjà présentes

- authentification par lien magique, onboarding, paramètres entreprise, membres, invitations, rôles et permissions ;
- tableau de bord et indicateurs ;
- capture publique des leads, sources/UTM, consentements, désinscription signée, clients, contacts, activités, fichiers et prochaine action ;
- pipeline commercial et opportunités ;
- clients multi-sites, projets, jalons, budget, fichiers, temps passé, recette et relevé technique piscine ;
- objectifs, tâches, récurrence et export calendrier ICS ;
- catalogue de prestations, fournisseurs, produits et dépôts ;
- devis versionnés, sections, lignes, statuts, PDF et conversion en commande, facture ou contrat ;
- contrats, modèles, clauses et parcours de signature ;
- commandes clients, acomptes/soldes, commandes fournisseur, réceptions, bons de livraison, mouvements et réservations de stock ;
- équipements installés, tickets SAV, interventions et contrats d'entretien ;
- factures verrouillées, règlements, avoirs, relances, récurrence, temps non facturé et Factur-X ;
- dépenses, pièces jointes et OCR Gemini ;
- import bancaire CSV et rapprochement ;
- synthèses comptables, notifications, recherche, réversibilité, journal d'audit, conformité et anonymisation ;
- centre de migration HubSpot/Extrabat avec archives brutes, simulation, import idempotent et vérification.

### 2.2 État technique mesuré

- Next.js 16, React 19.2, TypeScript strict et Prisma 6.2 ;
- SQLite conservé pour le développement ; schéma/client PostgreSQL et deux migrations versionnées validés sur une base PostgreSQL vierge ;
- 81 modèles Prisma couvrant CRM, vente, opérations, finance et migration ;
- stockage local de développement et Cloudflare R2 obligatoire en production ;
- BullMQ/Redis pour la génération documentaire asynchrone ;
- tests unitaires et scénarios Playwright critiques présents, dont permissions, migration, stock, commande/facturation, lead et relevé technique ;
- export de réversibilité versionné avec tables société, fichiers, manifestes et contrôles d'intégrité.

Les résultats exacts de typecheck, lint, tests, build et E2E doivent être régénérés sur le commit candidat final ; les mesures de l'audit du 23 août ne décrivent plus le dépôt actuel.

### 2.3 Limites bloquantes avant exploitation Diskoov

- audit administrateur des deux comptes réels, volumes, modules et personnalisations non encore versé au dépôt ;
- aucune API Extrabat générique ne peut être finalisée sans documentation et droits propres au compte ;
- reprise HubSpot des fichiers privés, formulaires, workflows et actifs marketing à compléter selon l'usage réel ;
- e-mail/calendrier bidirectionnels, campagnes de masse et marketing avancé non reconstruits ; les modèles, séquences simples et règles événementielles sont présents ;
- PWA hors ligne, photos/pièces d'intervention, planification de capacité et tournées non disponibles ;
- plateforme agréée de facturation électronique non choisie/intégrée ;
- hébergement, supervision, sauvegardes natives et restauration de production non prouvés dans le dépôt ;
- recette terrain/commerciale/financière et bascules réelles non exécutées.

Conclusion : le cœur vertical central est implémenté, mais la résiliation reste conditionnée aux données réelles, aux écarts d'usage et aux gates externes décrits dans la [matrice de couverture](../docs/coverage-and-external-dependencies.md).

## 3. Ce qu'il faut remplacer

### 3.1 Sortie de HubSpot — périmètre obligatoire

| Domaine | À reconstruire dans Diskoov | Priorité |
|---|---|---|
| Acquisition | formulaires du site, création automatique du lead, source/UTM, consentement, anti-spam, attribution | P0 |
| Référentiel | contacts, foyers/entreprises, adresses et sites multiples, dédoublonnage, propriétaire | P0 |
| Vente | pipelines configurables, étapes, probabilité, montant, prévision, motifs de perte, prochaine action | P0 |
| Activités | appels, notes, e-mails, rendez-vous, tâches, pièces jointes, chronologie unique | P0 |
| Productivité | modèles d'e-mail, rappels, files de travail, séquences simples et règles d'automatisation | P0 |
| Conformité | preuve de consentement, désinscription, liste d'opposition, durée de conservation | P0 |
| Pilotage | sources, conversion, vélocité, prévisions, activité par commercial, objectifs | P0 |
| Marketing avancé | campagnes, segmentation, scoring, tests et attribution multicanale | P1 selon usage réel |
| Conversations/social/ads | boîte partagée, publicité et réseaux sociaux | P2 ou fournisseur spécialisé |

HubSpot pourra être arrêté dès que les fonctions P0, l'historique et les formulaires du site sont validés. Il n'est pas nécessaire d'attendre la fin du remplacement d'Extrabat.

### 3.2 Sortie d'Extrabat — périmètre obligatoire

L'inventaire public Extrabat Piscine recense 211 fonctions réparties en 16 groupes. Diskoov ne doit pas toutes les cloner : il faut couvrir les processus réellement utilisés et documenter chaque exclusion.

| Domaine | À reconstruire dans Diskoov | Priorité |
|---|---|---|
| Catalogue | fabricants, fournisseurs, gammes, variantes, options, tarifs, remises, nomenclatures, documents | P0 |
| Avant-vente | qualification, photos, mesures, visite technique, étude d'implantation, faisabilité | P0 |
| Vente | devis, versions, options, remises, acompte, signature, commande client | P0 |
| Achats | commandes fournisseur, accusés, délais, réceptions, écarts et coûts | P0 |
| Stock | dépôts, mouvements, réservations par chantier, inventaire, traçabilité | P0/P1 selon usage |
| Chantier | modèles de travaux, tâches, dépendances, capacité, planning équipe, jalons, reste à faire | P0 |
| Terrain | PWA mobile, mode dégradé hors ligne, rapports, photos, temps, matériaux, signature client | P0 |
| Géographie | carte, secteurs, temps de trajet, tournées et rappels | P1 |
| Parc installé | produit, variante, numéro de série, site, date de pose, garantie, notices | P0 |
| SAV | prédiagnostic, ticket, urgence, affectation, intervention, pièces, garantie et coût réel | P0 |
| Contrats | entretien/maintenance, périodicité, visites, renouvellement et facturation | P1 selon activité |
| Finance | facture, acompte, avoir, paiement, relance, export comptable, rapprochement | P0 |
| Documents | GED client/chantier, classement, recherche, droits et conservation | P0 |
| Portail | documents, rendez-vous, messages, validation et suivi client | P1 |
| Pilotage | marge prévue/réelle, charge, délais, conversion, SAV et trésorerie | P0 |

### 3.3 À ne pas reconstruire par défaut

- comptabilité générale complète en partie double : conserver un export propre vers l'expert-comptable ;
- caisse magasin/POS si Diskoov n'en a pas l'usage réel ;
- centaines de rapports génériques : construire les 10 à 15 décisions de gestion utiles ;
- fonctions publicitaires, sociales ou de centre d'appels rarement utilisées ;
- paie, RH et gestion de flotte ;
- moteur de marketing automation équivalent à HubSpot Enterprise.

Chaque exclusion devra être signée par le gérant après observation des pratiques réelles. Cette discipline protège le budget et la date de sortie.

## 4. Parcours métier cible Diskoov

1. Un formulaire de `diskoov.fr`, un appel ou une recommandation crée un lead et sa preuve de consentement.
2. Le commercial qualifie le projet : type de piscine, dimensions, adresse, produit envisagé, délai, budget, photos et contraintes.
3. La visite initiale produit un relevé structuré et un dossier photo.
4. Le CRM prépare les variantes, options, prix, marge et devis ; le client signe et verse l'acompte.
5. La commande client déclenche les achats fournisseur et les tâches internes.
6. Les accusés et livraisons mettent à jour les délais, les réceptions et la disponibilité chantier.
7. Le responsable planifie la visite technique définitive et l'installation selon capacité, zone et matériel.
8. L'équipe terrain reçoit son dossier mobile, renseigne l'intervention, les photos, réserves et la signature.
9. L'installation crée les équipements du parc client avec série, garantie et documentation.
10. Le solde est facturé, transmis selon les règles de facturation électronique, encaissé et rapproché.
11. Une demande SAV retrouve immédiatement la vente, le produit, la garantie, les interventions et le fournisseur responsable.
12. La direction suit conversion, carnet de commandes, charge, délais, marge, trésorerie et coût SAV.

## 5. Architecture cible

### 5.1 Principes

État au 24 août : le monolithe modulaire, le double schéma SQLite/PostgreSQL, R2, les rôles, l'audit et les files documentaires sont présents dans le code. La PWA hors ligne, la supervision, l'infrastructure reproductible et les adaptateurs externes de facturation/cartographie ne le sont pas encore.

- monolithe modulaire Next.js au départ, avec domaines séparés et contrats internes clairs ;
- PostgreSQL managé à la place de SQLite ;
- stockage objet compatible S3 pour les documents, photos et PDF ;
- traitements asynchrones durables pour PDF, imports, e-mails, SMS et synchronisations ;
- PWA mobile avec cache local, file d'envoi et résolution de conflits pour le terrain ;
- journal d'audit append-only pour les actions sensibles ;
- adaptateurs remplaçables pour e-mail, SMS, calendrier, cartographie, signature et facturation électronique ;
- sauvegardes automatiques, restauration testée, métriques, alertes et suivi d'erreurs ;
- environnement de production, préproduction et développement séparés.

Créer des microservices maintenant ralentirait le projet. Les frontières de domaine doivent être propres, mais le déploiement doit rester simple jusqu'à ce que la charge prouve le besoin d'une séparation.

### 5.2 Sécurité et droits

- `Organization`, `Membership`, équipes, rôles et droits fins ;
- rôles initiaux : direction, commercial, administration des ventes, planification, technicien, SAV, comptabilité, lecture seule ;
- authentification renforcée, sessions révocables et MFA pour les profils sensibles ;
- liens publics signés, expirables et à usage unique pour devis/contrats ;
- chiffrement en transit et au repos, secrets hors base, protection anti-abus ;
- export, rectification, suppression/anonymisation et registre de consentement RGPD ;
- aucune donnée client sensible dans les journaux techniques.

## 6. Modèle de données à ajouter ou refondre

Cette section conserve le modèle conceptuel cible. Une grande partie est désormais matérialisée sous des noms Prisma pragmatiques (`Membership`, `CustomerSite`, `ProjectTechnicalProfile`, `Supplier`, `Product`, `CustomerOrder`, `PurchaseOrder`, `GoodsReceipt`, `StockReservation`, `Equipment`, `ServiceTicket`, `FieldIntervention`, `MaintenanceContract`, etc.). Les objets encore absents ne doivent pas être considérés comme implémentés ; la [matrice de couverture](../docs/coverage-and-external-dependencies.md) fait foi.

### Identité et CRM

`Organization`, `Membership`, `Team`, `Role`, `Lead`, `Contact`, `Account`, `Household`, `Address`, `CustomerSite`, `Consent`, `Activity`, `Task`, `EmailThread`, `Campaign`, `Sequence`, `Pipeline`, `Stage`, `Deal`, `Forecast`.

### Métier piscine et produits

`PoolProfile`, `SiteSurvey`, `Manufacturer`, `Supplier`, `Product`, `ProductVariant`, `Option`, `PriceBook`, `PriceRule`, `BillOfMaterials`, `TechnicalDocument`.

### Vente, achats et stock

`Quote`, `QuoteVersion`, `CustomerOrder`, `SupplierOrder`, `GoodsReceipt`, `StockLocation`, `StockMovement`, `StockReservation`.

### Exécution et terrain

`Job`, `JobTemplate`, `JobTask`, `Dependency`, `Appointment`, `Technician`, `Route`, `FieldReport`, `Acceptance`, `Timesheet`.

### Parc installé et SAV

`EquipmentAsset`, `SerialNumber`, `Warranty`, `ServiceCase`, `Diagnosis`, `Intervention`, `ServicePart`, `ServiceContract`, `MaintenanceVisit`.

### Finance et plateforme

`Invoice`, `Payment`, `CreditNote`, `AccountingExport`, `EInvoiceTransmission`, `Document`, `PortalMessage`, `AuditEvent`, `OutboxEvent`, `ImportBatch`, `SyncConflict`.

Les modèles actuels seront réutilisés quand leur sémantique convient ; ils ne doivent pas être renommés ou fusionnés avant une cartographie des données réelles.

## 7. Plan de migration et de sortie

La conception technique détaillée du transfert est décrite dans le [plan de reprise complète des données HubSpot et Extrabat](./diskoov-data-transfer-plan.md). La cible est un assistant de migration réutilisable, et non une succession d'imports manuels fragiles.

### 7.1 Audit des comptes réels — avant toute résiliation

Pour HubSpot, exporter et inventorier :

- contacts, entreprises, leads, transactions, tickets et objets personnalisés ;
- toutes les propriétés, associations, pipelines, étapes, propriétaires et équipes ;
- notes, tâches, appels, réunions, e-mails journalisés et pièces jointes ;
- formulaires et soumissions, workflows, séquences, modèles, listes et scoring ;
- abonnements, consentements, désinscriptions et listes d'opposition ;
- tableaux de bord, rapports, intégrations, clés et utilisateurs.

Pour Extrabat, exporter et inventorier :

- clients, prospects, contacts, adresses et sites ;
- articles, fournisseurs, prix, remises, catalogues et stock ;
- devis, commandes, bons de livraison, factures, avoirs, paiements et relances ;
- modèles de chantier, tâches, plannings, équipes et temps ;
- rapports, photos, signatures et documents ;
- équipements, numéros de série, garanties, SAV et contrats ;
- écritures/exports comptables, utilisateurs, droits, champs et automatismes personnalisés.

Chaque export doit être conservé brut, chiffré, horodaté et accompagné d'un manifeste indiquant le nombre de lignes, fichiers, erreurs et sommes de contrôle.

### 7.2 Méthode de migration

1. Cartographier chaque objet et chaque champ source vers le modèle cible.
2. Définir les règles de normalisation, dédoublonnage et conservation des identifiants historiques.
3. Construire des imports répétables et idempotents ; ne jamais migrer par copier-coller manuel.
4. Réaliser une migration pilote sur un échantillon représentatif.
5. Comparer les volumes, montants, statuts, relations et documents avec les sources.
6. Faire une migration générale, puis des deltas jusqu'au gel.
7. Passer les anciens outils en lecture seule pendant la période parallèle si les contrats le permettent.
8. Archiver les exports finaux et preuves avant résiliation.

### 7.3 Ordre de coupure

- **HubSpot** : bascule après 30 jours de fonctionnement parallèle sans perte de lead ; objectif réaliste, mois 3 à 5.
- **Extrabat** : bascule après deux cycles opérationnels complets et 6 à 8 semaines de parallèle ; objectif réaliste, mois 9 à 14 avec une petite équipe dédiée.

## 8. Feuille de route de réalisation

### 8.0 État d'exécution au 24 août 2026

| Phase | État du code | Reste avant validation |
|---|---|---|
| Phase 0 — preuve réelle | **Partielle** | audit public et plans produits ; comptes, volumes, contrats et usages Diskoov réels encore à inventorier |
| Phase 1 — fondations | **Implémentée dans le code** | déploiement PostgreSQL/R2, supervision, sauvegarde/restauration et recette de sécurité en environnement réel |
| Phase 2 — HubSpot | **Partielle** | capture/CRM/consentement/import présents ; compléter les actifs réellement utilisés, répéter la migration et mener la bascule |
| Phase 3 — vente/opérations | **Partielle avancée** | relevé, devis/commande, achats, réceptions et stock présents ; valider catalogues, prix, planning et données Extrabat réelles |
| Phase 4 — terrain/SAV | **Partielle** | équipements, tickets, interventions et entretien présents ; hors-ligne, photos/pièces, capacité/tournées et pilote terrain restent à traiter selon besoin |
| Phase 5 — finance/sortie | **Partielle** | factures, paiements, banque, Factur-X et réversibilité présents ; plateforme agréée, portail éventuel, rapprochement final et résiliation restent ouverts |

Les estimations initiales ci-dessous restent des ordres de grandeur de cadrage. Elles ne constituent plus un calendrier d'exécution constaté.

### Phase 0 — preuve et cadrage réel, 2 à 3 semaines

- ateliers d'observation avec le gérant et chaque rôle ;
- enregistrement de 10 dossiers réels de bout en bout ;
- audit des configurations, contrats, volumes, exports et échéances HubSpot/Extrabat ;
- matrice `reprendre / simplifier / supprimer / externaliser` ;
- choix de l'hébergement et des fournisseurs techniques ;
- backlog, critères d'acceptation et plan de continuité validés.

**Jalon :** périmètre P0 signé, données exportables prouvées, date de renouvellement connue.

### Phase 1 — fondations production, 4 à 6 semaines

- équipe multi-utilisateur, rôles et droits ;
- PostgreSQL, migrations, stockage objet et sauvegardes ;
- audit, supervision, sécurité, préproduction et déploiement ;
- correction du build, de la signature publique et des tests critiques ;
- référentiels client, site, produit et documents consolidés.

**Jalon :** restauration testée, contrôle d'accès validé, zéro défaut critique ouvert.

### Phase 2 — remplacement HubSpot, 8 à 12 semaines

- formulaires `diskoov.fr`, attribution, consentements et dédoublonnage ;
- CRM 360, pipeline, activités, tâches, e-mail/calendrier et automatisations P0 ;
- tableaux de bord vente et acquisition ;
- import complet HubSpot et répétition de la bascule ;
- formation des commerciaux et période parallèle.

**Jalon :** 100 % des leads captés, historique vérifié, utilisateurs autonomes, HubSpot résiliable.

### Phase 3 — vente, achats et exécution Extrabat, 10 à 14 semaines

- relevé technique Diskoov, catalogue et règles de prix ;
- devis/commande/acompte ;
- achats, réceptions et stock nécessaire ;
- modèles de chantier, capacité, planning et alertes ;
- migration des dossiers commerciaux et opérationnels.

**Jalon :** un dossier neuf complet de la qualification à la planification sans Extrabat.

### Phase 4 — terrain, parc installé et SAV, 10 à 14 semaines

- PWA terrain et mode hors ligne ;
- rapports, photos, signature, réserves et réception ;
- équipements, séries, garanties et documentation ;
- SAV, diagnostic, affectation, intervention, pièces et coût ;
- contrats de service si confirmés dans le périmètre.

**Jalon :** deux équipes/pilotes exécutent les visites, poses et SAV sans retour à Extrabat.

### Phase 5 — finance, portail et sortie Extrabat, 8 à 12 semaines

- facturation finale, paiements, avoirs, relances et rapprochement ;
- connecteur de facturation électronique et export expert-comptable ;
- portail client minimal ;
- migration finale des données et documents ;
- tests de charge, sécurité, reprise et continuité ;
- parallèle 6 à 8 semaines, gel, delta final et résiliation.

**Jalon :** clôture mensuelle réconciliée, archives complètes, Extrabat résiliable.

Les phases peuvent se chevaucher avec 2 à 4 personnes, mais les jalons de sécurité et de migration ne doivent pas être compressés.

## 9. Charge, équipe et calendrier réalistes

### Équipe minimale recommandée

- un responsable produit/métier disponible chaque semaine, idéalement le gérant ou son mandataire ;
- un développeur full-stack principal ;
- un second développeur à partir des modules terrain/finance ;
- QA/recette à temps partiel puis renforcée avant les bascules ;
- expert-comptable et référent RGPD/sécurité sollicités aux jalons concernés.

### Ordres de grandeur

- avec 2 à 4 personnes : HubSpot résiliable en 3 à 5 mois ; remplacement complet en 9 à 14 mois ;
- avec un seul développeur : environ 14 à 20 mois, avec risque élevé de dépendance à une personne ;
- charge globale indicative : 350 à 550 jours-personnes, à recalibrer après l'audit des comptes réels.

La qualité de l'export Extrabat, le nombre de catalogues/automatismes et le besoin réel de stock/hors-ligne sont les principaux facteurs de variation.

## 10. Coûts restant après résiliation

À budgéter séparément des développements :

- hébergement applicatif, PostgreSQL, stockage, CDN et sauvegardes ;
- surveillance, journaux, alertes et suivi d'erreurs ;
- envoi et réception d'e-mails, SMS et éventuellement téléphonie ;
- cartographie, géocodage et calcul d'itinéraire ;
- signature électronique si un niveau de preuve externe est requis ;
- plateforme agréée de facturation électronique ;
- maintenance corrective, mises à jour de sécurité et assistance utilisateurs.

L'arbitrage pertinent est le coût total sur trois ans : développement + exploitation + maintenance, comparé aux licences évitées et aux gains de temps. Une estimation en euros serait trompeuse sans le nombre d'utilisateurs, les factures actuelles, les volumes SMS/e-mail, le stockage et le niveau de service attendu.

## 11. Conformité à intégrer au produit

- facturation électronique : la réception devient obligatoire pour toutes les entreprises au 1er septembre 2026 ; l'émission concerne les PME/TPE au 1er septembre 2027. Le CRM doit donc se connecter à une **plateforme agréée** et ne pas prétendre assurer seul la transmission réglementaire ;
- conservation : les pièces comptables et justificatifs doivent être archivés avec intégrité, lisibilité et traçabilité pendant les durées légales applicables ;
- prospection B2C par e-mail : consentement préalable, preuve, identité claire et désinscription simple, sous réserve de l'exception client existant pour des offres analogues ;
- prospection B2B : information et opposition simple, avec qualification correcte de la base légale ;
- démarchage téléphonique des particuliers : intégrer au cadrage le changement annoncé au 11 août 2026, ainsi que ses textes d'application ;
- RGPD : minimisation, finalités, base légale, durées, droits, sous-traitants, violation de données et registre des traitements.

Ce plan ne remplace pas la validation d'un expert-comptable ou d'un conseil juridique.

Références officielles : [DGFiP — facturation électronique et plateformes agréées](https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees), [AIFE — calendrier B2B](https://aife.economie.gouv.fr/nos-applications/facturation-electronique-b2b/), [Service-Public — conservation des documents](https://entreprendre.service-public.fr/vosdroits/F10029), [CNIL — prospection par courrier électronique](https://www.cnil.fr/la-prospection-commerciale-par-courrier-electronique), [CNIL — prospection B2C et évolution téléphonique](https://www.cnil.fr/fr/la-prospection-b-to-c-quelles-regles-pour-transmettre-des-donnees-des-partenaires).

## 12. Qualité et critères d'acceptation

### Automatisation minimale

- tests unitaires des règles de prix, taxes, marge, statuts et droits ;
- tests d'intégration des transactions vente/achat/stock/facture ;
- scénarios navigateur des parcours P0 ;
- tests de migration avec réconciliation automatique ;
- tests de sécurité sur isolation des sociétés, liens publics et fichiers ;
- tests de restauration, reprise après incident et mode hors ligne ;
- suivi de performance sur listes, recherche, PDF et imports.

### Conditions non négociables avant résiliation

- 100 % des objets critiques et documents attendus sont présents ou explicitement classés hors périmètre ;
- les totaux financiers et stocks concordent avec les sources ;
- deux recettes complètes consécutives sont signées par les métiers ;
- aucun défaut P0/P1 bloquant n'est ouvert ;
- les utilisateurs sont formés et les procédures d'incident sont écrites ;
- une restauration a été exécutée avec succès ;
- les exports finaux et archives légales sont lisibles indépendamment des anciens outils ;
- la plateforme agréée et l'export comptable sont opérationnels ;
- un plan de retour temporaire ou de traitement manuel est testé pour chaque flux critique.

## 13. Indicateurs de réussite

- 100 % des leads du site créés en moins d'une minute, sans double saisie ;
- réponse au prospect compatible avec la promesse publique de rappel sous 48 heures ;
- taux de doublons inférieur à 1 % ;
- 95 % des dossiers ont une prochaine action et un responsable ;
- zéro devis, facture ou intervention perdu lors des migrations ;
- marge prévue et marge réelle disponibles par affaire ;
- planning, visite et pose réalisables sur mobile ;
- historique SAV relié à chaque équipement installé ;
- clôture et rapprochement acceptés par la gestion ;
- aucune connexion métier à HubSpot ou Extrabat pendant 60 jours avant résiliation définitive.

## 14. Registre des risques

| Risque | Impact | Réponse |
|---|---|---|
| export incomplet d'un ancien outil | perte d'historique | tester les exports dès la phase 0, archiver brut et contrôler les volumes |
| dérive vers un clone total | délai et budget | matrice d'usage signée, P0 strict, revue mensuelle du périmètre |
| incident lors de la bascule | arrêt opérationnel | parallèle, deltas, runbook, sauvegardes et solution manuelle temporaire |
| erreurs financières | risque légal et trésorerie | invariants, transactions, réconciliation et validation expert-comptable |
| hors-ligne terrain complexe | données conflictuelles | pilote limité, outbox, stratégie de conflit et télémétrie |
| catalogue/prix obsolètes | marge dégradée | versions, dates d'effet, approbation et import contrôlé |
| dépendance à un développeur | continuité faible | documentation, revue, tests, déploiement reproductible et second mainteneur |
| sécurité/RGPD | atteinte aux clients | droits minimaux, audit, chiffrement, sauvegarde et procédure d'incident |

## 15. Actions immédiates — prochain lot de preuve

1. Récupérer factures, contrats, échéances et liste des modules réellement utilisés dans HubSpot/Extrabat.
2. Créer les accès d'audit temporaires et produire les premiers exports complets, GED comprise.
3. Renseigner les volumes et décisions dans la [matrice de couverture](../docs/coverage-and-external-dependencies.md).
4. Déployer une préproduction PostgreSQL/R2 distincte et exécuter une restauration contrôlée.
5. Rejouer deux migrations complètes selon le [runbook de bascule](../docs/migration-cutover-runbook.md).
6. Faire recetter dix dossiers réels : vente, achat, stock, chantier, intervention, facture et paiement.
7. Recetter les séquences/règles et décider les écarts HubSpot P0 restants : boîte e-mail, calendrier, campagnes, scoring et branches avancées.
8. Décider les écarts Extrabat P0 : hors-ligne, photos/pièces, capacité, tournées, catalogues et tarifs.
9. Choisir la plateforme agréée de facturation et valider l'export avec l'expert-comptable.
10. Fixer le go/no-go, le rollback, les responsables et les dates de périodes parallèles avant toute résiliation.

## 16. Décisions encore à obtenir — sans bloquer le démarrage

- nombre d'utilisateurs et rôles exacts ;
- montants et dates de renouvellement HubSpot/Extrabat ;
- modules réellement utilisés, personnalisations et intégrations ;
- volume de données et documents ;
- gestion actuelle des catalogues, achats et stock ;
- responsabilité exacte entre Diskoov et les fabricants pour visite définitive, pose, garantie et SAV ;
- solution de comptabilité de l'expert-comptable ;
- besoin de signature qualifiée, de SMS, de téléphonie et de mode hors ligne ;
- objectif de disponibilité et délai maximal de reprise ;
- budget et équipe mobilisables.

## 17. Recommandation finale

L'arrêt des deux abonnements est réalisable, à condition de le traiter comme la construction d'un produit métier critique et une migration de données, pas comme une simple refonte d'interface.

La décision la plus rentable est de sortir rapidement de HubSpot grâce au socle CRM déjà présent, puis de remplacer Extrabat par vagues, en commençant par le flux qui crée du chiffre d'affaires : qualification → devis → commande → planification → pose → facture → SAV. La résiliation doit être la conséquence d'une preuve opérationnelle mesurée, jamais une date arbitraire.

## 18. Sources fonctionnelles principales

- [Diskoov — activité et parcours public](https://diskoov.fr/)
- [Extrabat Piscine — présentation officielle](https://www.extrabat.com/piscine/)
- [Extrabat — ressources officielles](https://www.extrabat.com/ressources/)
- [HubSpot — comprendre les objets CRM](https://knowledge.hubspot.com/fr/records/understand-objects)
- [HubSpot — fonctions commerciales](https://knowledge.hubspot.com/fr/get-started/generate-sales)
- [HubSpot — workflows](https://knowledge.hubspot.com/fr/workflows/understand-workflow-object-types)
- [HubSpot Developers — architecture CRM](https://developers.hubspot.com/docs/api-reference/latest/crm/understanding-the-crm)

L'[audit préliminaire détaillé](./diskoov-crm-audit-and-roadmap.md) conserve l'inventaire plus exhaustif des modules publics et les constats techniques ayant servi à ce plan.
