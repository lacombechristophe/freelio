# Matrice de couverture et dépendances externes

Date de l'audit du code : 1er septembre 2026
Portée : état du dépôt et recette technique de la production ; la configuration réelle des comptes métier et des fournisseurs externes reste à valider.

## 1. Légende

| État | Signification |
|---|---|
| **Disponible** | parcours et modèle présents dans le dépôt ; une recette réelle reste nécessaire |
| **Partiel** | noyau présent, mais écart fonctionnel ou opérationnel explicite |
| **Externe** | dépend d'un fournisseur, d'un contrat ou d'une validation hors dépôt |
| **Non couvert** | aucune fonction exploitable correspondante dans le dépôt |

Cette matrice interdit d'assimiler « modèle Prisma présent » à « remplacement validé ». Pour résilier un ancien outil, la preuve attendue est un parcours métier réel, des données réconciliées et une procédure de continuité.

## 2. Couverture du remplacement HubSpot

| Domaine HubSpot | État | Couverture actuelle | Limite / gate de sortie |
|---|---|---|---|
| Capture du site | **Disponible** | `POST /api/public/leads`, validation, origine ou secret, honeypot, limite de débit, dédoublonnage | brancher le vrai formulaire public, supervision et test de perte de lead |
| Source et UTM | **Disponible** | source, landing page, referrer et paramètres UTM conservés sur lead/opportunité | tableaux d'attribution avancés absents |
| Consentement | **Disponible** | événements et preuve hashée, retrait interne, lien public signé généré depuis la file prospects, retrait idempotent | pas de centre de préférences multicanal ; durées et texte RGPD à valider |
| Clients et contacts | **Disponible** | fiches entreprise/particulier, contacts, coordonnées, activités, fichiers et prochaine action | dédoublonnage global/humain encore limité |
| Vues de listes | **Partiel** | vue Clients composée avec recherche, filtres typés cumulables, colonnes standard/personnalisées, tri, sélection, export CSV et vues persistées ; vues personnelles également présentes sur contacts et devis | pagination serveur, partage équipe et actions en masse de modification à généraliser aux autres index |
| Sites/adresses multiples | **Disponible** | `CustomerSite` structuré avec accès et coordonnées | géocodage/cartographie non intégrés |
| Pipeline commercial | **Partiel** | plusieurs pipelines nommés, pipeline par défaut, étapes configurables et réordonnables, protections des étapes occupées, opportunités, responsable, montant, probabilité, clôture prévue/réelle, motif de perte obligatoire et forecast pondéré du mois | règles conditionnelles d’étape, approbations, prévisions multi-périodes, quotas et statistiques de vélocité à approfondir |
| Propriétés CRM | **Disponible** | définitions multi-objets pour clients, contacts, opportunités, chantiers, tickets et équipements ; texte, nombre, devise, date, booléen, choix simple/multiple ; groupes, ordre, presets, édition de fiche et historique avant/après avec auteur | formules calculées, propriété utilisateur, dépendances conditionnelles et administration en masse restent à approfondir |
| Chronologie commerciale | **Partiel** | activités manuelles/importées et conversations e-mail rattachées aux clients, contacts ou prospects | appels et réunions externes non synchronisés tant qu’un connecteur Google/Microsoft n’est pas autorisé |
| Tâches et agenda | **Partiel** | objectifs, tâches, récurrence et export ICS | pas de synchronisation calendrier bidirectionnelle, invitations ou disponibilité |
| E-mails individuels | **Disponible sous configuration** | composition, aperçu HTML isolé, fils entrants/sortants, rattachement CRM, réponses, événements signés de livraison/ouverture/clic/rejet/plainte, statistiques à 30 jours et envoi par clé Resend ou OAuth Google/Microsoft | domaine et webhook Resend, ou consentement OAuth de la boîte retenue, à configurer et recetter avec de vrais messages |
| Modèles, séquences, workflows | **Partiel** | modèles HTML assainis avec aperçu, e-mails automatiques/manuels, appels et tâches, pause jusqu’à réalisation dans Organisation, délais, jours ouvrés, fenêtre/fuseau d’envoi, statistiques par étape, inscriptions consenties avec pause/reprise/arrêt individuels, prochaine échéance et motif, arrêt sur réponse ou opposition, triggers lead/devis/e-mail/portail/intervention, branche conditionnelle vrai/alternatif, publication versionnée, simulation sans effet, notifications, changement de statut et journal idempotent | éditeur graphique, branches imbriquées multiples, modification d’un brouillon publié et test A/B restent à approfondir |
| Formulaires HubSpot existants | **Partiel** | endpoint public de remplacement | remplacement du code embarqué/CTA et historique des soumissions à faire hors code |
| Marketing automation/campagnes | **Partiel** | dossiers de campagne avec objectif, audience, canaux, responsable, période, budget, UTM, plan de livrables, séquences rattachées et statistiques ; activation réelle du segment vers la séquence avec contrôle adresse/consentement/opposition/statut/doublon et lot borné ; arrêt immédiat sur retrait/réponse | test A/B, attribution avancée, validation éditoriale multi-acteur et très gros volumes restent à compléter ou externaliser |
| Scoring/segmentation/listes | **Disponible** | score borné et détaillé, règles métier configurables, file priorisée, segments actifs ou statiques multicritères et reconstruction sans doublon | valider les points et critères avec l’équipe commerciale sur les données réelles |
| Conversations, publicité, social | **Partiel** | boîte e-mail CRM partagée et portail client couverts | live chat, publicité et publication sociale à externaliser ou exclure formellement |
| Rapports commerciaux | **Partiel** | centre de direction 30/90/365 jours, comparaison à période équivalente, acquisition, pipeline réel/pondéré, conversion devis, encaissement, chantiers, achats, SAV, e-mails, signaux actionnables, permissions par domaine et export CSV audité | constructeur personnalisé, attribution multicanale, vélocité, objectifs par commercial, dashboards sauvegardés et envoi planifié restent à compléter selon les usages réels |
| Import historique HubSpot | **Partiel** | découverte, exports CRM asynchrones, objets personnalisés, associations, analyse/import/vérification | fichiers privés, formulaires, workflows, inbox et certains historiques exigent des exports/API complémentaires |

**Conclusion HubSpot :** le cœur CRM/vente, la capture, les boîtes Resend/Google/Microsoft, les séquences, l’activation contrôlée des audiences, le scoring, les segments et les règles événementielles sont couverts dans le produit. Une résiliation reste bloquée tant que les boîtes historiques et leurs consentements OAuth ne sont pas recettés, ou si l’entreprise dépend de calendriers bidirectionnels, de campagnes à très gros volume, du live chat, de publicité/social ou de workflows à branches non reconstruits.

## 3. Couverture du remplacement Extrabat

| Domaine Extrabat | État | Couverture actuelle | Limite / gate de sortie |
|---|---|---|---|
| Clients, contacts et sites | **Disponible** | référentiel client, sites d'installation structurés et agence opérationnelle responsable | import réel et contrôle des doublons nécessaires |
| Relevé technique piscine | **Disponible** | statut, mesures, forme, margelles, terrasse, accès, alimentation, obstacles, produit/modèle/couleur et validation | faire valider le formulaire par les techniciens et les fabricants |
| Catalogue produits | **Partiel** | gammes et variantes, SKU, fabricant/fournisseur, options obligatoires ou multiples, suppléments vente/coût, nomenclatures anti-cycle, pertes, tarifs historisés et stock | règles tarifaires dimensionnelles et imports automatiques des catalogues fabricants à ajouter selon les fichiers obtenus |
| Fournisseurs | **Disponible** | coordonnées, délais, conditions et rattachement produits/achats | évaluation fournisseur et EDI restent optionnels selon les échanges réels |
| Devis | **Disponible** | versions, sections, lignes libres ou configurées, options contrôlées serveur, nomenclature/coût, remises, marges par catégorie, TVA mixte, statuts et PDF ; calcul central pur et testé au centime | formules dimensionnelles propres aux fabricants à paramétrer lorsque leurs barèmes sont disponibles |
| Signature de contrat | **Disponible** | contrat, avenant structuré et proposition de renouvellement ; lien public jetonné, expiration/usage unique, canvas, empreinte d’intégrité et piste d'audit | niveau de preuve à valider juridiquement ; ce n'est pas une signature qualifiée externe |
| Commande client | **Disponible** | création directe ou depuis devis, lignes, totaux, chantier lié et état de facturation | amendements/annulations et workflow d'approbation limités |
| Acompte et solde | **Disponible** | facture d'acompte idempotente et facture du reste à payer | contrôler les règles comptables réelles et cas d'avoirs complexes |
| Achats fournisseur | **Disponible** | brouillon multi-lignes, rattachement chantier, approbation dédiée, PDF, envoi, accusé, référence et date confirmée, reliquats et piste d'audit | relance automatique fournisseur et EDI restent à décider selon les échanges réels |
| Réception fournisseur | **Disponible** | réception partielle/complète, lignes stockées ou libres, quantités acceptées/rejetées, entrée en stock, anomalies, résolution par remplacement/avoir/acceptation, retours et avoirs fournisseur | litiges financiers complexes et intégration comptable des avoirs à recetter avec l'expert-comptable |
| Dépôts et stock | **Disponible** | dépôts rattachés aux agences, quantité, réservé, disponible, seuil, emplacement, mouvements transactionnels et transferts inter-dépôts corrélés par une sortie/entrée atomique | inventaire tournant, méthodes de valorisation comptable et lots/séries à compléter si requis |
| Réservation chantier/commande | **Disponible** | réservation, libération, consommation et traçabilité | allocation automatique et substitutions produit absentes |
| Bon de livraison | **Disponible** | lignes, reliquats, destinataire, signature horodatée et scellée SHA-256, statut et PDF métier | niveau de preuve de réception à faire valider juridiquement selon les usages réels |
| Chantiers | **Partiel** | projet, site, modèles réutilisables, budget/type/durée par défaut, étapes datées, responsables, dépendances anti-cycle et blocage des prérequis, recette, documents et temps | marge réelle globale, plan de ressources et cas métier des modèles à recetter sur les dossiers réels |
| Planning | **Partiel** | tâches et jalons dépendants, interventions replanifiables, demandes de rendez-vous client, affectation membre, rejet serveur des chevauchements et charge hebdomadaire comparée à la capacité configurable | pas de temps de trajet routier ni d’optimisation automatique |
| Terrain mobile | **Disponible** | PWA installable, cache borné à 24 h, missions, catalogues de stock, brouillons, photos, matériel, frais/justificatifs, réserves, accord et signature manuscrite conservés hors ligne puis resynchronisés de manière rejouable | hors-ligne volontairement limité au terrain ; une fusion automatique de deux modifications concurrentes du même rapport n'est pas proposée |
| Parc installé | **Disponible** | site, produit, fabricant, modèle, série, pose, garantie et état | notices et historique de pièces non structurés |
| Tickets SAV | **Disponible** | client/site/équipement, priorité, affectation, échéance, statuts, résolution, diagnostics guidés historisés et interventions rattachées | règles et guides propres à l'entreprise à valider sur les dossiers réels |
| Centre de support et SLA | **Disponible** | files filtrables, charge, horaires/jours/fermetures ouvrés, objectifs de première réponse et résolution par priorité, suspension, routage par compétence/territoire/capacité, macros, chronologie e-mail, notes internes et fusion restaurable des doublons | engagements contractuels, compétences et capacités de l'équipe réelle restent à paramétrer et recetter |
| Interventions SAV | **Disponible** | planification, technicien, progression, rapport, minutes, coût horaire, consommation transactionnelle du stock, coût matériel figé, photos/pièces, frais justifiés, réserves et reprises, signature manuscrite, scellement SHA-256 et PDF client | la valeur juridique de la preuve et les règles internes de clôture restent à faire valider par l'entreprise |
| Contrats d'entretien | **Disponible** | contrat, site, équipements, fréquence, prochaine visite, prix, visites/factures idempotentes, préavis, indexation, proposition signable, décision et nouveau terme historisé | les clauses et cas tarifaires propres à l'entreprise restent à recetter ; l'alerte sortante dépend du fournisseur e-mail |
| GED | **Partiel** | fichiers client/projet/dépense/intervention, stockage R2 privé, hash, contrôle de signature de fichier et accès authentifié | classement, recherche plein texte et politiques de conservation à formaliser |
| Base de connaissances | **Disponible** | articles catégorisés, brouillon/publication/archive, visibilité interne ou portail, tags, aperçu HTML assaini et fiche d'aide sécurisée | recherche plein texte avancée, suggestions automatiques et validation éditoriale multi-étapes restent à approfondir |
| Satisfaction | **Disponible** | enquêtes CSAT/NPS/CES, échelles contrôlées, invitation rattachée au client/contact/ticket, jeton hashé expirant, réponse publique atomique, verbatim et indicateurs | automatiser l'envoi après événement, définir les seuils et la boucle d'escalade métier avec l'équipe |
| Portail client | **Disponible** | liens hashés temporaires/révocables, identité issue du profil, suivi de projets/interventions, devis/factures/fichiers, messages, demandes de rendez-vous et articles d'aide publiés | recette avec de vrais clients, politique de durée et notification e-mail du lien à formaliser |
| Cartographie/tournées | **Partiel** | coordonnées saisissables, tournées quotidiennes chronologiques par intervenant, distance à vol d’oiseau et alertes de créneaux en conflit | pas de carte, géocodage, trafic ni optimisation routière ; fournisseur externe à choisir si ces fonctions sont requises |
| Caisse/POS | **Non couvert** | — | exclure formellement si non utilisé |
| Import historique Extrabat | **Partiel** | dépôt CSV/JSON/Excel/ZIP/PDF, mappings métier étendus et vérification | pas d'extracteur générique sans documentation API du compte ; restitution/export Extrabat obligatoire |

**Conclusion Extrabat :** le dépôt couvre le flux central vente → commande → achat/stock → chantier → facturation ainsi que le SAV, le portail, le terrain hors ligne borné, les preuves d’intervention, le stock et les frais terrain, les réserves, les dépendances de chantier, la capacité hebdomadaire et l’ordre de tournée. L’optimisation routière et les règles/catalogues très spécifiques restent des gates selon les pratiques réelles de l’entreprise.

## 4. Finance, conformité et administration

| Domaine | État | Couverture actuelle | Limite / dépendance |
|---|---|---|---|
| Factures | **Disponible** | standard, acompte, avoir, verrouillage après émission, échéance, PDF et calcul central pur avec TVA mixte et remises | recette légale/comptable sur les vrais cas de l’entreprise pilote |
| Factur-X | **Disponible** | XML généré et embarqué dans le PDF | valider le profil et la conformité avec l'expert-comptable/PDP |
| Facturation électronique | **Externe** | champs de préparation, routage et journal | aucune transmission à une plateforme agréée ; fournisseur à choisir et intégrer |
| Règlements | **Disponible** | paiements partiels/complets, moyen et référence | pas d'initiation de paiement ni de lettrage bancaire automatique complet |
| Avoirs | **Disponible** | avoir lié et facture de type crédit | cas comptables complexes à recetter |
| Relances | **Disponible sous configuration** | préparation modifiable, envoi réel par la messagerie active, historique facture et Communications, trois paliers configurables, exclusion des factures réglées, verrou concurrent, temporisation des échecs et clé d’idempotence par facture/palier | worker ou ordonnanceur supervisé et boîte active indispensables ; délivrabilité à contrôler chez le fournisseur |
| Récurrence | **Disponible** | modèles, échéances, génération autonome idempotente par worker ou cron et occurrence auditée | ordonnanceur et alertes d’échec à mettre en service sur l’infrastructure réelle |
| Banque | **Partiel** | import CSV, dédoublonnage et rapprochement facture/dépense | aucune connexion bancaire temps réel |
| Dépenses/OCR | **Disponible** | saisie, justificatif et OCR Gemini optionnel | contrôle humain obligatoire ; Gemini est externe |
| Export comptable | **Partiel** | synthèse/export des écritures applicatives | format exact de l'expert-comptable à valider ; pas de comptabilité générale |
| TVA/mentions légales | **Partiel** | paramètres et règles documentaires | veille juridique et validation professionnelle indispensables |
| Consentements RGPD | **Partiel** | preuve de capture, retrait interne ou lien public signé et idempotent | durées, registre complet et traitement des autres demandes de droits à formaliser |
| Export/anonymisation | **Partiel** | export utilisateur et anonymisation ciblée | champ d'application à faire valider ; conservation légale prioritaire |

## 5. Socle technique et exploitation

| Domaine | État | Couverture actuelle | Limite / gate production |
|---|---|---|---|
| Multi-utilisateur | **Disponible** | memberships, invitations et rôles Owner/Admin/Sales/Operations/Technician/Service/Accounting/Viewer | recette de chaque rôle et revue des accès |
| Multi-agences | **Disponible** | magasins, secteurs de pose ou équipes SAV, agence principale, membres, sites, chantiers et dépôts rattachés, filtre/comparaison et transferts corrélés ; Owner/Admin voient toute la société, les autres rôles sont bornés côté Prisma à leurs agences actives sur les dossiers opérationnels | valider les affectations réelles avant ouverture des comptes et compléter au cas par cas les futurs objets métier qui recevraient une agence directe |
| Permissions | **Partiel** | lecture/écriture par domaine, isolation `companyId`, administration des agences et refus serveur des lectures/mutations opérationnelles inter-agences | les clients restent volontairement partagés à l’échelle société ; audit de sécurité/pentest externe nécessaire |
| Authentification | **Disponible** | création de compte, scrypt salé, récupération par jeton hashé à usage unique, MFA TOTP, codes de secours hashés/consommables, révocation globale versionnée des JWT et journal d’audit ; le lien magique est refusé quand le MFA est actif | Resend et domaine d’envoi doivent être configurés pour distribuer les liens de récupération ; pentest externe requis avant données réelles |
| Signature publique | **Disponible** | jeton hashé, expiration, usage unique et rate limiting | revue de sécurité et niveau de preuve métier |
| PostgreSQL | **Disponible** | schéma miroir, client dédié et 37 migrations versionnées ; réparation idempotente documentée pour l’ancien schéma Vercel | hébergeur, haute disponibilité, sauvegardes et restauration à mettre en service |
| Stockage objet | **Disponible** | R2 privé obligatoire en production, hash et accès authentifié | versioning/rétention/sauvegarde fournisseur à configurer |
| Rate limiting | **Disponible** | Upstash distribué ou mémoire locale | Upstash requis en production multi-instance |
| Files de travaux | **Partiel** | BullMQ pour les documents, processeur persistant des séquences e-mail et ordonnanceur entretien/factures récurrentes/relances dans le worker, avec rotation équitable entre sociétés et routes de cron protégées | supervision, alertes, quotas et procédure de rejeu à configurer |
| PDF | **Disponible** | devis, facture Factur-X, contrat, rapport d’intervention et bon de livraison | plateforme compatible Chromium et QA visuelle requises |
| Journal d'audit | **Partiel** | actions sensibles journalisées | couverture non garantie de toutes les mutations, politique d'immutabilité/rétention à définir |
| Réversibilité | **Disponible** | export versionné des tables société, fichiers locaux/R2 et manifeste d'intégrité, avec secrets/jetons exclus | la reprise du JSON est logique et contrôlée ; le PRA complet repose sur PostgreSQL/R2 natifs |
| Sauvegarde/PRA | **Externe** | export applicatif utile à la portabilité | sauvegardes natives PostgreSQL/R2, PITR et tests de restauration à configurer |
| Supervision | **Partiel** | logs structurés et routes publiques de vie/aptitude sans exposition de secrets | brancher moniteur, collecte d’erreurs, métriques et alertes humaines |
| CI/CD | **Partiel** | workflow GitHub Actions : génération Prisma, types, lint, 215 tests unitaires, build et Playwright sur base isolée ; déclenchement push, PR ou manuel | fournisseurs externes et secrets associés restent à administrer |
| E2E | **Disponible** | 23 parcours critiques réussis sur build production isolé, dont reporting desktop/mobile, avec 13 mutations mobiles volontairement omises après preuve desktop | recette finale avec comptes fournisseurs et données réelles nécessaire |
| PWA/hors ligne | **Disponible pour le terrain** | manifeste, service worker et espace terrain hors ligne borné avec reprise rejouable des clôtures, photos, sorties de stock, frais, justificatifs, réserves et signatures | pas de fonctionnement hors ligne du CRM/ERP complet ni de fusion avancée de conflits |
| Sécurité externe | **Externe** | CSP, contrôles de routes, chiffrement et rate limiting dans le code | revue de configuration, pentest et procédure incident avant données réelles |

## 6. Dépendances qui subsistent après HubSpot/Extrabat

L'objectif est zéro licence HubSpot/Extrabat, pas zéro service externe.

| Service | Rôle | Caractère | Décision avant production |
|---|---|---|---|
| PostgreSQL managé | base de données | obligatoire | fournisseur, région, TLS, PITR, rétention, RPO/RTO |
| Cloudflare R2 | documents et archives | obligatoire avec le code actuel | bucket privé, versioning/rétention, sauvegarde et région juridique |
| Resend | e-mails CRM, réception/événements et liens magiques optionnels | obligatoire pour les communications e-mail actuelles, pas pour la connexion par mot de passe | domaine, MX, SPF/DKIM/DMARC, webhook signé, quotas, alertes et plan d'incident |
| Google Workspace / Microsoft 365 | reprise/synchronisation des boîtes et calendriers existants | optionnel selon l’usage réel | application OAuth, consentement administrateur, périmètres minimaux et recette incrémentale |
| Upstash Redis | rate limiting partagé | obligatoire en multi-instance/public | région, quotas et alertes |
| Redis/BullMQ | travaux asynchrones | conditionnel | nécessaire si `DOC_GEN` est utilisé ; persistance et supervision |
| Google Gemini | OCR de justificatifs | optionnel | contrat de traitement des données ou désactivation |
| Plateforme agréée de facturation | émission/réception réglementaire | obligatoire selon calendrier légal | choisir, contractualiser, intégrer et recetter |
| Expert-comptable | validation/export/clôture | obligatoire métier | format d'export et contrôles signés |
| Cartographie/SMS/téléphonie | terrain et communication | optionnel selon usages | choisir ou exclure explicitement |
| HubSpot | source temporaire de migration | temporaire | conserver jusqu'au PV HubSpot puis révoquer/résilier |
| Extrabat | source temporaire de migration et rollback | temporaire | conserver jusqu'aux cycles complets/PV puis révoquer/résilier |

## 7. Conditions de résiliation par outil

### HubSpot résiliable lorsque

- le formulaire réel alimente Diskoov sans perte pendant la période parallèle ;
- l'historique CRM et les pièces utiles sont réconciliés ;
- chaque workflow/séquence/formulaire actif est reconstruit, externalisé ou abandonné par décision signée ;
- les commerciaux réalisent lead → qualification → devis → commande sans HubSpot ;
- les consentements/oppositions sont conservés et applicables ;
- le rollback et l'export final sont validés.

### Extrabat résiliable lorsque

- la restitution complète et la GED ont été obtenues ;
- stock, commandes, factures, paiements, équipements et SAV concordent ;
- deux cycles opérationnels complets sont réalisés dans Diskoov ;
- les limites restantes des tournées et des catalogues spécifiques sont couvertes ou exclues explicitement ;
- l'export expert-comptable et la plateforme de facturation électronique sont opérationnels ;
- les archives restent lisibles sans Extrabat et le rollback est validé.

## 8. Décisions à obtenir du gérant

- HubSpot : quelles boîtes Google/Microsoft, campagnes, publicités, conversations ou calendriers doivent réellement être repris ?
- Extrabat : quels modules, exports, stocks, catalogues, plannings et automatismes sont actifs ?
- les techniciens ont-ils besoin d'un mode hors ligne et de photos/signatures manuscrites ?
- faut-il ajouter une carte/tournée optimisée, des SMS ou une téléphonie intégrée au portail et aux e-mails déjà couverts ?
- quelle plateforme agréée et quel format comptable sont imposés ?
- quels RPO, RTO, horaires de support et responsables d'incident sont acceptés ?
- quelles limites de cette matrice sont acceptables avant chaque résiliation ?

Ces réponses ne bloquent pas les répétitions de migration ; elles bloquent une déclaration de remplacement complet lorsqu'elles concernent un usage réel.
