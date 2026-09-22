# Plan de commercialisation — fiabilité, migrations et exploitation

Date : 22 septembre 2026. Référence inspectée : `main`, `d81a12f`.
Statut : plan établi ; aucun lot ci-dessous ne devient terminé par la seule présence de ce document.

## 1. Objectif et règles de décision

Commercialiser un SaaS pour piscinistes capable de couvrir les usages convenus avec l’entreprise pilote, avec reprise des données vérifiable, exploitation supervisée et facturation commerciale opérationnelle. Ce n’est ni une promesse de reproduire toute la gamme HubSpot/Extrabat, ni une garantie d’absence absolue de panne.

- Le remplacement des outils historiques exige une recette métier et une réconciliation des données, pas un nombre de pages ou de tests verts.
- Aucun développement supplémentaire sans problème explicite, périmètre et preuve de réussite.
- Aucun import sur le compte de production pilote pendant les essais. Copies isolées, données minimisées et accès limités.
- Ne pas déclencher d’e-mails, de relances, d’automatisations, de factures nouvelles ou de mouvements physiques lors d’un import historique.
- Ne pas modifier les sources HubSpot/Extrabat. Ne pas résilier les anciens outils avant acceptation du transfert et validation de la continuité.
- Pas d’écriture de secrets dans Git, les rapports ou les captures ; configuration par interface sécurisée ou gestionnaire de secrets.
- Les intégrations externes et choix commerciaux non encore décidés restent explicitement bloqués, sans empêcher les lots indépendants.

## 2. État vérifié et limites du diagnostic

| Domaine | Observation dans le dépôt | Conséquence |
|---|---|---|
| HubSpot | Client API daté `2026-03`, découverte, demandes d’exports, téléchargement et import | Fonction présente, connexion réelle non recettée pendant cet audit ; ne pas attribuer la panne à une version d’API inventée |
| HubSpot : orchestration | Export lancé pour chaque objet accessible ; erreurs de lancement stockées séparément des tâches ; statut final calculé à partir des tâches | Un objet demandé mais non exporté doit interdire un succès global trompeur |
| HubSpot : reprise | Pas de politique explicite de reprise 429/5xx dans le client ; erreurs conservées sur la tâche lors d’une actualisation ultérieure | Retry borné et remise à jour des erreurs après succès à tester |
| Extrabat | `testExtrabatConnection` teste un GET ; découverte explicitement non disponible | Pas d’extracteur API complet aujourd’hui. Un HTTP 200 sur une page HTML ne prouve pas l’accès aux données |
| Import commun | `importMigrationRun` charge toutes les lignes, passe à `IMPORTING`, puis traite dans une Server Action | Interruption brutale et concurrence non maîtrisées ; reprise durable prioritaire |
| Tests migration | Test d’intégration : six objets synthétiques, import répété et rapprochement | Utile mais insuffisant pour valider export fournisseur, pièces jointes, gros volumes et crashs |
| Fichiers migration | Téléchargement en mémoire jusqu’à 500 Mo ; parseur structuré limité à 60 Mo ; plafond de lignes | Limites à harmoniser et rendre visibles ; aucune ligne omise silencieusement |
| PDF | Chromium par génération ; routes HTTP directes ; worker documentaire sans appel applicatif trouvé | Choisir un parcours canonique ; ne pas déployer le worker documentaire comme s’il était déjà le parcours réel |
| PDF / Factur-X | Échec d’insertion XML ramené au PDF original ; worker affectant `SENT` après génération | Erreur explicite et séparation génération / émission / envoi nécessaires |
| R2 | UUID par fichier ; vérification puis copie d’un upload temporaire | Pas d’écrasement normal de deux photos distinctes ; risque de changement de source entre vérification et copie |
| Isolation | Authentification, permissions et filtres entreprise présents ; pas de politiques RLS trouvées | Défense applicative à éprouver, défense base à concevoir sans déploiement aveugle |
| SaaS commercial | Checkout Stripe, portail, webhook, onboarding, forfaits et quotas membres/agences présents | Recetter et durcir l’existant, pas réécrire ces briques |
| PostgreSQL | Migrations dédiées et job CI ; schéma miroir par connecteur | Contrôler les écarts et les vrais parcours PostgreSQL ; les mocks unitaires ne prouvent pas l’isolation SQL |

Sources locales : `src/actions/migrations/index.ts`, `src/lib/migrations/*`, `tests/unit/migration-database.integration.test.ts`, `src/lib/pdf/generator.ts`, `src/lib/bullmq/*`, `src/lib/local-files.ts`, `src/lib/billing/*`, `.github/workflows/ci.yml`.

## 3. Ordre d’exécution et livrables

L’ordre est : L0 → L1 → L2 → L3, avec L4/L5 indépendants après L0 ; L6 et L7 avant pilote payant ; L8 avant ouverture générale. Les corrections urgentes PDF/fichiers de L4 peuvent précéder la fin des connecteurs. Chaque lot se termine par revue du diff, tests ciblés, vérification globale pertinente, documentation et commit distinct. Une CI annulée n’est pas une validation.

### L0 — Reproduction des imports et cadrage du lancement (P0)

Travaux :

1. Reproduire séparément connexion, découverte, extraction, téléchargement, analyse, simulation, import et vérification. Capturer étape, identifiant de lot, statut HTTP, erreur expurgée et identifiant de corrélation fournisseur.
2. Distinguer navigateur, API fournisseur, autorisations, stockage, base et exécution du worker. Ne pas transformer toutes les erreurs en « clé invalide ».
3. Constituer un jeu anonymisé représentatif de chaque source et un état initial chiffré : objets, relations, documents, soldes, devis ouverts, interventions et contrats actifs.
4. Établir la matrice des usages indispensables avec le pilote : vente, pose, SAV, facturation, messagerie, marketing, terrain et éventuelle caisse. Documenter ce qui doit être conservé comme archive plutôt que converti.
5. Vérifier le déploiement réellement servi, l’authentification et les configurations nécessaires sans exporter les secrets.

Acceptation : un ticket reproductible par panne, étapes connues et exemples exploitables. Pour les étapes non accessibles : blocage nommé, pas verdict « fonctionne ».

### L1 — Socle durable des migrations (P0)

Architecture cible : l’interface crée une intention ; PostgreSQL conserve état, progression et résultats ; un worker supervisé traite des lots bornés. Réutiliser BullMQ si retenu pour le transport, sans en faire l’unique source de vérité. Prévoir le rattrapage des tâches non publiées et des tâches abandonnées.

- Machine d’états explicite, transitions atomiques et une seule réservation active par travail ; aucune séquence lecture puis mise à jour non conditionnelle.
- Bail avec expiration, renouvellement et jeton de génération empêchant un ancien worker d’écrire après reprise par un autre.
- Checkpoint après chaque lot ; pagination en base et budget mémoire/temporel, pas de chargement de toute l’archive en mémoire.
- Unité transactionnelle : écriture métier + association de l’ID source + journal de progression. Établir l’idempotence par compte source, objet et ID source, pas uniquement par fournisseur.
- Redis indisponible, timeout réseau, redémarrage et livraison répétée ne doivent ni perdre un travail ni créer des doublons.
- Politique de conflits : ne pas écraser une modification locale postérieure ; proposer ignorer, fusionner ou arbitrer avec aperçu des différences.
- Annulation coopérative entre lots, reprise explicite, erreurs téléchargeables et conservation bornée des données temporaires.
- Archives : contrôle de taille pendant lecture/décompression, plafonds fichiers/lignes, protection des chemins, formats et encodages ; erreurs visibles au dépassement, aucun succès tronqué.
- Préserver les originaux et le journal de provenance. Un retour arrière ne doit pas supprimer un dossier utilisé depuis : compensation contrôlée ou restauration isolée, jamais suppression globale aveugle.

Acceptation : tuer le worker avant/après chaque point de persistance, reprendre, relancer deux fois et lancer deux workers ; résultats identiques, sans doublons ni travail éternellement `IMPORTING`. Vérifier que les effets externes restent désactivés.

### L2 — HubSpot de bout en bout (P0)

- Vérifier les endpoints et capacités du compte avec la documentation actuelle. La version `2026-03` existe ; ne pas revenir à v3 sans justification.
- Diagnostic des droits par objet et du droit d’export. Un test de lecture d’un contact ne vaut pas validation de l’ensemble des permissions.
- Déclarer un inventaire attendu avant extraction : inclus, vide, indisponible, exclu avec motif. Distinguer absence de données et absence de droits.
- Extraction via exports pour les objets réellement supportés ; lecture paginée des API d’objets/associations là où nécessaire et autorisée ; repli par fichier expliqué, jamais silencieux.
- Ordonnancer les exports selon les quotas documentés ; respecter `Retry-After`, temporisation avec dispersion, nombre de tentatives borné et erreurs terminales.
- Persister chaque demande d’export, renouveler un téléchargement expiré, traiter les exports partitionnés et vérifier tous les fichiers. Valider aussi les redirections de téléchargement et leurs destinations.
- Récupérer les associations, propriétés personnalisées, responsables, étapes/pipelines et historiques nécessaires. Ne pas assimiler l’export CRM aux conversations complètes, aux pièces jointes ou aux définitions d’automatisations.
- Classer explicitement chaque contenu : converti, conservé en archive consultable, à reconstruire ou inaccessible. Les workflows/séquences nécessitent une traduction métier, pas une copie supposée compatible.
- Pour la distribution SaaS : connexion OAuth avec scopes minimaux et cycle de révocation/renouvellement ; conserver si utile l’application privée comme option de migration administrateur. Ne pas confondre ces deux modes.

Acceptation : compte de test puis copie pilote ; 401, 403, 429, 5xx, timeout, URL expirée, tâche annulée, objet non supporté et réussite après erreur couverts. Un objet requis en échec interdit le statut global complet. Rapport des comptes, relations, montants et pièces jointes avec écarts expliqués.

### L3 — Extrabat : fichiers fiables puis API documentée (P0)

- Ne plus afficher une simple page répondant HTTP 200 comme preuve de connexion API métier.
- Obtenir les exports réellement disponibles et leur dictionnaire : clients, contacts, sites, devis/lignes, factures/avoirs/règlements, articles/fournisseurs, commandes, stock, chantiers, interventions, contrats, équipements, activités et documents.
- Construire des mappings versionnés à partir d’échantillons réels, avec prévisualisation et sauvegarde. Gérer accents, séparateurs, dates françaises, TVA, montants, avoirs, documents annulés et identifiants réutilisés.
- Conserver les numéros et pièces historiques sans leur attribuer une nouvelle émission ; rapprocher paiements, soldes et lignes comptables, sans inventer les associations manquantes.
- Fournir un guide d’export par catégorie et un rapport de ce qui manque. Pas de promesse « données complètes » avant inventaire des pièces et de l’historique.
- Connecteur API uniquement après obtention des endpoints, auth, droits contractuels, pagination, quotas et accès pièces jointes. Protéger toute URL configurable contre SSRF, redirections et envoi de secrets à une destination non autorisée.
- Fusion HubSpot/Extrabat : règles de rapprochement assistées et réversibles ; ne pas fusionner automatiquement sur le seul nom, téléphone ou e-mail partagé.

Acceptation : import d’un véritable export anonymisé, seconde exécution sans doublon, reprise après crash, relations et totaux rapprochés. Sans accès API documenté, seule la voie fichiers peut être déclarée livrée ; l’API reste explicitement indisponible.

### L4 — PDF, fichiers et reprise après incident (P0)

- Parcours PDF canonique partagé par devis, factures, contrats et portail ; environnement Chromium maîtrisé, worker supervisé ou service dédié retenu après mesure.
- Concurrence et file d’attente bornées, quotas par entreprise, délais, métriques mémoire/CPU et erreurs visibles ; vérifier le binaire Chromium dans l’environnement réellement déployé.
- Générer à partir d’une version figée ; ne pas régénérer silencieusement une facture émise depuis les coordonnées actuelles. Identité de génération et publication conditionnelle à la version attendue.
- Séparer génération, émission légale, envoi et paiement. Supprimer les transitions `SENT` induites par une simple génération ; refuser toute régression d’état.
- L’échec Factur-X est une erreur explicite si demandé. Un PDF simple éventuel doit être identifié comme tel, sans prétendre à la conformité structurée.
- Restreindre les ressources chargées par Chromium ; HTML assaini, actifs maîtrisés et aucune requête réseau interne induite par contenu utilisateur.
- Publication d’upload portant exactement sur les octets validés ; intégrité de copie, finalisation répétée, expiration de lien et nettoyage des orphelins.

Acceptation : OOM/arrêt forcé simulé, retry, double demande, modification concurrente, panne R2/base et écriture interrompue. Aucune sortie incomplète publiée ; aucune facture payée repassée envoyée ; tous les documents courts/longs relus.

### L5 — PostgreSQL et isolation interentreprises (P0)

- PostgreSQL de référence pour les tests d’intégration ; comparaison schéma/migrations et migration d’une base précédente contenant des données, pas uniquement création à vide.
- Inventorier toutes les surfaces : actions, routes, workers, recherche, rapports, exports, fichiers, liens publics, intégrations et administration.
- Tests entreprise A/B sur lecture, création, modification, suppression et associations imbriquées ; tester aussi permissions réduites et accès révoqué.
- Vérifier contraintes de relations interentreprises et accès aux objets sans `companyId` direct.
- Concevoir puis appliquer progressivement RLS en staging avec rôle applicatif non propriétaire/non `BYPASSRLS`, contexte transactionnel, policies `USING`/`WITH CHECK` et exceptions minimales pour workers/public.
- Tester pool de connexions, absence de contexte, changement d’entreprise, sauvegarde/restauration et administration. Aucun SQL générique directement en production ; plan de retour arrière vérifié.

Acceptation : tentatives croisées échouent sans fuite de données ni modification ; aucune requête ne bénéficie accidentellement du contexte de la précédente ; suite PostgreSQL réelle et contrôles de migrations verts.

### L6 — Abonnements, accès et exploitation commerciale (P0)

- Conserver Stripe existant : recetter inscription → organisation → essai/forfait → paiement → renouvellement → impayé → régularisation → résiliation → export.
- Droits contrôlés dans les opérations serveur, pas seulement navigation/middleware ; quotas atomiques face aux créations simultanées.
- Webhooks signés, doublons, désordre chronologique, reprise après crash, rapprochement périodique avec Stripe ; prévenir les abonnements multiples involontaires.
- Définir la politique d’impayés et de fin de contrat : accès aux exports, conservation, suppression et réactivation. Ne pas effacer automatiquement les données sur un simple paiement échoué.
- Infrastructure commerciale autorisée, base et stockage supervisés, secrets séparés par environnement, rotation et journalisation expurgée.
- Alertes actionnables : erreurs, latence, backlog/âge des tâches, échecs fournisseurs, mémoire, connexions DB, stockage et dépenses. Fixer des budgets et une procédure d’astreinte/support.
- Sauvegardes chiffrées base + documents ; exercice de restauration complet. Proposer RPO 24 h et RTO 4 h pour le pilote, à mesurer et à valider avant toute promesse contractuelle.

Acceptation : recette Stripe sandbox et contrôle live autorisé, restauration chronométrée, incident simulé détecté, responsable et procédure connus. Aucun forfait ne dépend d’une modification manuelle de `.env` par client.

### L7 — Conformité et intégrations métier (P0 selon promesse vendue)

- Choisir une plateforme agréée avec validation commerciale, technique et comptable ; intégrer émission, réception, statuts, rejets, annuaire et e-reporting des flux concernés, avec idempotence.
- Valider Factur-X/PDF-A avec les outils et règles du partenaire retenu ; l’XML embarqué seul ne clôt pas la conformité.
- Recetter Google/Microsoft/Resend avec consentements réels, pièces jointes, révocation, renouvellement, webhook rejoué, envoi incertain et absence de doublons ; désabonnements et arrêt des séquences sur réponse.
- Faire valider CGV, politique de confidentialité, DPA, sous-traitants, rétention, droits d’accès/export/suppression et engagements support par les personnes compétentes.
- Contrôler toutes les promesses marketing : pas de mention « conforme », « migration intégrale », « sauvegarde garantie » ou « remplacement complet » sans preuve correspondant au périmètre.

Acceptation : recette partenaire et cas métier pilote signés ; aucune obligation commerciale annoncée n’est laissée à un connecteur non configuré.

### L8 — Parcours produit, capacité et bascule (P0 lancement)

- Reprendre la revue UI existante, sans la remplacer : chaque page, vide/chargement/erreur/données longues/permission réduite, bureau/mobile, clavier et zoom 200 % ; contrôler les formulaires, panneaux et actions réelles.
- Recetter les chaînes complètes : acquisition → devis → commande → achat/stock → pose → facture/règlement ; SAV → intervention → compte rendu ; maintenance → échéance → renouvellement ; import → recherche → exploitation.
- Essais de charge sur staging : hypothèse initiale de 50 entreprises, 100 sessions actives, 10 demandes PDF simultanées et deux imports en parallèle. Ajuster au volume réel, notamment lignes, documents et tailles ; ne pas confondre inscriptions et concurrence.
- Seuils proposés à confirmer par mesure : p95 des interactions serveur ordinaires ≤ 1 s, erreur < 1 %, acceptation d’un travail long ≤ 2 s ; traitements lourds en file sans bloquer les autres entreprises. RAM/CPU/DB et coût par entreprise mesurés ; aucune marge commerciale affirmée sans calcul.
- Aucun abandon silencieux sous surcharge : rejet explicite ou attente bornée, équité entre entreprises et budgets fournisseurs.
- Pilote isolé, migration à blanc, comparaison comptable, échantillons métier et inventaire complet des pièces ; bascule avec gel ou delta source maîtrisé, sauvegarde, retour arrière et surveillance renforcée.
- Période pilote proposée : deux semaines d’usage représentatif sans incident bloquant, complétée par scénarios accélérés de renouvellement, expiration et impayés. Le calendrier seul ne vaut pas validation.

## 4. Conditions de sortie

| Passage | Preuves requises | Refus de passage |
|---|---|---|
| Staging → pilote | Imports répétables, isolation A/B, PDF/fichiers fiables, restauration, accès réel et supervision | P0 technique ouvert ou données sans provenance |
| Pilote → pilote payant | Contrat/périmètre clair, paiement recetté, intégrations indispensables fonctionnelles, support prêt | Fonction vendue inaccessible ou dépendance cachée |
| Pilote payant → ouverture générale | Recette métier, capacité et coûts mesurés, conformité du périmètre, alertes et procédures éprouvées | Incident bloquant, migration non rapprochée ou retour arrière non validé |
| Résiliation anciens outils | Inventaire accepté, tous les écarts résolus ou explicitement acceptés, documents consultables, flux actifs migrés | Perte non expliquée, historique requis absent ou automatisation essentielle non remplacée |

Chaque source doit satisfaire : éléments attendus = importés + archivés consultables + exclus explicitement + rejetés identifiés. Les rejets sur données obligatoires bloquent la bascule. Les montants sont rapprochés au centime, les relations contrôlées et les documents comparés par inventaire et empreinte quand disponibles.

## 5. Informations externes nécessaires, sans bloquer le travail local

À demander au pilote : étape exacte et message d’erreur de chaque import, export anonymisé réel de chaque outil, objets/documents attendus, volumétrie, permissions du compte HubSpot, documentation/API Extrabat disponible et confirmation des usages indispensables. Ne jamais demander une clé secrète dans le chat ; utiliser un canal de configuration sécurisé.

À décider avant achat/déploiement : fournisseur du worker/hébergement, budget d’exploitation, plateforme agréée, politique des offres et rétention. Les décisions payantes et la bascule des données réelles demandent une validation explicite ; aucune simulation ne peut les remplacer.

## 6. Traçabilité de l’exécution

Pour chaque lot : statut (à faire/en cours/bloqué/validé), cause du blocage, fichiers/commit, tests exécutés et résultats, preuves visuelles si UI, procédure de retour arrière et limites connues. Les plans historiques restent le backlog fonctionnel ; ce document donne les critères prioritaires de commercialisation et corrige les hypothèses de l’audit du 22 septembre.

Première tranche de réalisation : reproductions L0 + tests de régression des statuts incomplets HubSpot et faux positifs Extrabat ; ensuite L1 avant d’augmenter le volume ou d’ouvrir les imports réels. Pas de déploiement production automatique à l’issue de la rédaction de ce plan.

## 7. Exécution — premier correctif de diagnostic

Les tests ont reproduit cinq erreurs HubSpot avant correction : oubli des échecs de lancement dans le résultat, lot vide promu complet, erreur transitoire persistante après succès, erreurs fournisseur ignorées et actualisation d’un lot déjà vérifié. Correction : comptabilisation des échecs, statut vide `FAILED`, état des erreurs actualisé et publication conditionnelle sur état/date de modification. Huit tests ciblés passent, y compris conflit concurrent et résultat sans URL. Cela ne réserve pas encore les téléchargements concurrents et ne remplace pas L1.

Extrabat : cinq tests échouaient sur les faux positifs HTML/JSON et le contrôle de destination. Le test exige désormais une origine approuvée par l’opérateur (`EXTRABAT_API_ALLOWED_ORIGINS`), refuse les redirections et vérifie le JSON. Il ne valide toujours pas les droits métier : état `REACHABLE` et message explicite ; aucun extracteur API prétendu disponible. Sept tests ciblés passent. La liste d’origines est une frontière de confiance opérateur : elle ne doit jamais contenir d’hôte interne ou contrôlé par un client. Aucun compte fournisseur réel contacté par ces tests.

Le parseur XLSX signale déjà le dépassement de lignes : la présence d’une troncature interne ne suffit pas à conclure à une omission silencieuse. L1 doit vérifier que les erreurs de parsing bloquent effectivement la validation globale, format par format.

Vérification globale du lot imports : `npm run verify` réussi (types, lint, 324 tests / 75 fichiers et build optimisé). Recette UI et CI à consigner ; aucune validation de production ni bascule de données à ce stade. Les requêtes fournisseur sont simulées dans les nouveaux tests, qui ne valident pas les droits ni les formats réels du compte pilote.

## 8. Sources officielles consultées

- HubSpot : [API datée 2026-03](https://developers.hubspot.com/docs/api/how-to-use-hubspot-api), [exports et permission crm.export](https://developers.hubspot.com/docs/api-reference/legacy/crm/exports/guide), [partitionnement et limites d’associations](https://developers.hubspot.com/changelog/crm-export-partitioning-and-association-limits). Revalider les capacités par endpoint au moment de l’implémentation.
- Extrabat : [exports d’affaires](https://servicescompris.extrabat.com/exporter-affaires-utilisateur/), [exports de contrats de services](https://servicescompris.extrabat.com/exports-des-services/). Ces ressources historiques ne prouvent ni l’exhaustivité des exports actuels ni un droit API pour le compte pilote.
- [RLS PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [limites Vercel](https://vercel.com/docs/functions/limitations), [conditions Hobby](https://vercel.com/docs/plans/hobby).
- [DGFiP : plateformes agréées](https://www.impots.gouv.fr/facturation-electronique-et-plateformes-agreees). Faire confirmer l’application des obligations aux flux et à la taille de l’entreprise ; ne pas substituer ce plan à un avis comptable/juridique.
