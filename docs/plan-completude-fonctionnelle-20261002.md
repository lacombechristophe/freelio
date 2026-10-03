# Freelio — audit et plan de complétude fonctionnelle

Date : 2 octobre 2026. Référence du code examiné : `61c6be3895c416b0631941b93b228892cd1794a7`.

## 1. Objectif et portée

Faire de Freelio un projet démontrable et défendable devant un CTO : des parcours terminés, des règles métier explicites, des intégrations honnêtement qualifiées et des preuves reproductibles. La cible immédiate reste une démonstration avec données fictives, budget d'hébergement de **0 €**, sans ouverture commerciale.

Cet audit repose sur la lecture des actions serveur, moteurs, routes, schémas, interfaces concernées et tests existants. L'examen détaillé porte sur les communications, OAuth, le marketing, les campagnes et les automatisations ; la cartographie transversale couvre les autres domaines. Il ne constitue pas une nouvelle recette exhaustive de chaque écran. Les risques déduits du code doivent être reproduits sur fixtures isolées avant correction. Aucun envoi, consentement OAuth réel, changement de données métier ou changement d'interface n'a été effectué pour cet audit.

La [CI du commit examiné](https://github.com/lacombechristophe/freelio/actions/runs/37056456374) réussit ses trois jobs : 457 tests SQLite, 456 tests PostgreSQL avec un test réservé à SQLite exclu, 79 E2E réussis et 19 exclusions intentionnelles de viewport/parcours, huit contrôles Linux. Les seuils de couverture concernent six modules ciblés, pas l'ensemble du produit. Ces résultats établissent une base technique ; ils ne prouvent ni la complétude fonctionnelle ni les échanges avec les fournisseurs réels.

Ce document fixe le plan de complétude et conserve les constats de l’audit initial. Les corrections, accords de présentation, résultats par SHA et limites courantes sont dans la [recette de complétude](completude-recette-20261003.md), notamment sa synthèse du registre. Une ligne du constat initial ne signifie pas que son ancien défaut subsiste ; un sous-lot corrigé ne clôture pas automatiquement son lot entier. Les plans d'août/septembre et leurs nombres de tests restent historiques. Le [suivi CTO](execution-cto-20261001.md), la [carte des preuves](carte-des-preuves.md) et le [runbook](production-runbook.md) restent utiles pour les autres exigences techniques.

## 2. Ce qui existe et doit être conservé

- Google et Microsoft disposent déjà d'un parcours OAuth avec état signé, expiration, PKCE, vérification du compte et stockage chiffré des tokens. Resend prend en charge l'envoi et les webhooks signés.
- Les séquences possèdent déjà des fenêtres horaires, jours ouvrés, contrôles de consentement/suppression, tâches manuelles, arrêts sur réponse, claims d'envoi, reprises de brouillons OAuth, retries et échecs terminaux.
- Les scénarios possèdent conditions, branche conditionnelle, simulation et snapshots de publication. La publication JSON est testée sur SQL ; le moteur d'exécution doit encore être relié durablement à ces versions.
- Le calendrier possède déjà sync tokens Google, delta Microsoft, annulations et écriture de tâches. Il faut achever la continuité et la gestion des conflits.
- Consentements avec finalité/base/preuve, retrait signé, désinscription en un clic des séquences, suppression après plainte/rebond existent. Le manque porte sur leur exploitation cohérente et leurs préférences, pas sur leur absence totale.
- Les domaines métier incluent devis, factures archivées, contrats et avenants, achats/réceptions/retours, stock/réservations, SAV, interventions, maintenance, portail, propriétés CRM, rôles et agences. Plusieurs annuaires ont déjà une pagination serveur.

## 3. Registre des écarts constatés

**P0** : intégrité, isolement ou comportement dangereux avant usage réel. **P1** : nécessaire à un parcours complet dans le périmètre annoncé. **P2** : profondeur utile après le socle fiable. **P3** : extension conditionnée par un besoin concret. Les lignes ci-dessous décrivent l’état ouvert au 2 octobre ; consulter la recette liée pour leur état après corrections. Un écart de code n'est pas une panne observée chez un fournisseur.

| ID | Priorité | Constat et conséquence | Preuve dans le code |
|---|---|---|---|
| MAIL-01 | P0 | Gmail et Microsoft lisent une première page de 50 messages par dossier seulement. Gmail avance ensuite `lastSyncAt` : un backlog ancien hors chevauchement peut être perdu. Microsoft peut ne jamais atteindre les messages anciens. | [email-sync.ts](../src/lib/communications/email-sync.ts), `googleMessages`, requêtes Graph et `syncOAuthEmailChannel` |
| MAIL-02 | P1 | Un message déjà importé est ignoré ; lu/non lu, déplacement et suppression ne sont pas réconciliés. Les pièces OAuth ne sont pas récupérées. Resend conserve déjà des métadonnées de pièces. | [email-sync.ts](../src/lib/communications/email-sync.ts), `persistMessage` ; [webhook Resend](../src/app/api/webhooks/resend/route.ts) |
| MAIL-03 | P0 | L'envoi manuel appelle le fournisseur avant de créer l'historique SQL, avec une nouvelle clé à chaque invocation. Une acceptation distante suivie d'une panne SQL laisse un résultat ambigu et une nouvelle tentative peut doubler l'envoi. | [communications](../src/actions/communications/index.ts), `sendCrmEmail` |
| MAIL-04 | P1 | Un contact destinataire obligatoire, HTML seul ; pas de brouillon utilisateur persistant, CC/CCI, pièce jointe sortante ni programmation manuelle. Les brouillons techniques de reprise OAuth ne sont pas une fonction utilisateur. | `sendSchema` dans [communications](../src/actions/communications/index.ts), `mimeMessage` dans [email-provider.ts](../src/lib/communications/email-provider.ts) |
| MAIL-05 | P1 | La réponse relie un fil local mais ne transmet pas sa référence au transport. Le regroupement par sujet peut mélanger des expéditeurs inconnus ; le modèle n'identifie pas la boîte du fil. | [communications](../src/actions/communications/index.ts), [threads.ts](../src/lib/communications/threads.ts), [email-provider.ts](../src/lib/communications/email-provider.ts) |
| MAIL-06 | P1 | Le tableau charge 100 fils et les 100 premiers messages de chacun, plus 500 contacts. Les derniers messages d'un long fil peuvent être invisibles ; les archives sont exclues de cette lecture. | `getCommunicationDashboard` dans [communications](../src/actions/communications/index.ts) |
| MAIL-07 | P0 | L'unicité des messages est globale `(provider, providerId)`, alors que les connexions sont propres à une société. Le rattachement des webhooks et des messages doit être qualifié avec deux sociétés/boîtes utilisant le même identifiant distant. | [schema.prisma](../prisma/schema.prisma), `EmailMessage`, `CommunicationChannel` ; `persistMessage` ; webhook Resend |
| OAUTH-01 | P0 | Refresh et mise à jour du curseur réécrivent le même blob chiffré sans contrôle de version. Deux traitements peuvent écraser un token tournant ou un curseur récent. La synchronisation manuelle n'a pas de bail propre à la connexion. | `validOAuthCredentials`, `storeOAuthCalendarCursor` dans [email-provider.ts](../src/lib/communications/email-provider.ts) ; `syncCommunicationChannel` |
| OAUTH-02 | P1 | Mail et calendrier sont demandés ensemble. Microsoft utilise `organizations` : les comptes personnels ne font pas partie du parcours actuel. Les capacités mail partielles doivent être contrôlées, indépendamment du calendrier. | `buildEmailAuthorizationUrl` dans [email-oauth.ts](../src/lib/integrations/email-oauth.ts) |
| OAUTH-03 | P1 | Déconnexion locale uniquement, malgré « Connexion révoquée » ; certains retours anticipés du callback ne nettoient pas le cookie. Pas de preuve de révocation distante ou de cycle complet chez Google/Microsoft. | [communications](../src/actions/communications/index.ts), [callback](../src/app/api/integrations/email/oauth/callback/route.ts) |
| OAUTH-04 | P0 | Les boîtes sont partagées à l'échelle société via `automation.read`, sans ACL de boîte. Avant de brancher une boîte personnelle, définir explicitement visibilité, propriétaire, agence et consentement au partage. | `getCommunicationDashboard` ; `CommunicationChannel` ; [permissions.ts](../src/lib/permissions.ts) |
| CAL-01 | P1 | Google/Graph s'arrêtent après dix pages sans enregistrer la continuation intermédiaire. Au-delà, une initialisation peut recommencer les mêmes pages. La panne mail empêche le calendrier de démarrer. | [calendar-sync.ts](../src/lib/communications/calendar-sync.ts), [communication-sync.ts](../src/lib/communications/communication-sync.ts) |
| CAL-02 | P2 | Calendrier principal, horizon borné et synchronisation de tâches ; pas de politique complète d'invitations, disponibilités, conflits, récurrences et choix de calendrier. La progression de l'horizon doit être qualifiée. | [calendar-sync.ts](../src/lib/communications/calendar-sync.ts), `calendarHorizon`, écritures distantes |
| MKT-01 | P0 | Le recalcul lit au maximum 5 000 prospects puis supprime les adhésions hors de ce sous-ensemble. Au-delà, des membres encore éligibles peuvent être retirés ; scores et segments n'ont pas une génération complète commune. | `refreshMarketingIntelligence` dans [marketing](../src/actions/marketing/index.ts) |
| MKT-02 | P1 | Création des règles/segments, mais pas d'action d'édition, archivage ou gestion manuelle des membres. Une liste statique créée par ce parcours reste vide et n'est pas recalculée. | [marketing](../src/actions/marketing/index.ts), [interface marketing](../src/app/dashboard/marketing/marketing-intelligence.tsx) |
| MKT-03 | P2 | Critères simples et listes bornées à 500 prospects/100 adhésions affichées. Il faut recherche/pagination, combinaison de critères, exclusions et explication de l'éligibilité. | [marketing](../src/actions/marketing/index.ts), [intelligence.ts](../src/lib/marketing/intelligence.ts) |
| CAMP-01 | P0 | Changer le statut de campagne ne change pas les inscriptions. Le processeur vérifie la séquence, pas le statut/dates de campagne ; une campagne en pause peut continuer à envoyer. L'inscription d'une campagne planifiée l'active sans attendre sa date de début. | `updateMarketingCampaignStatus`, `enrollCampaignAudience` dans [campaigns](../src/actions/campaigns/index.ts) ; [sequences.ts](../src/lib/automations/sequences.ts) |
| CAMP-02 | P1 | Pas de parcours complet d'édition de campagne/ressource, validation préalable, snapshot d'audience et reprise d'activation après traitement partiel. Les inscriptions sont déjà dédupliquées, à conserver. | [campaigns](../src/actions/campaigns/index.ts) |
| CAMP-03 | P2 | Les métriques utilisent le statut final des livraisons : un clic compte aussi comme ouverture. Attribution par UTM, sans entonnoir de revenu/coût. Les assets SMS/social/Ads sont du suivi de ressources, pas des connecteurs de diffusion. | `getCampaignDashboard`, `channelSchema`, `assetSchema` dans [campaigns](../src/actions/campaigns/index.ts) |
| AUTO-01 | P0 | Les effets métier puis l'événement ne sont pas durablement liés. Des appels `.catch` permettent d'acquitter/importer sans exécuter les scénarios. Un rejeu du message importé ne réémet pas l'événement. | [email-sync.ts](../src/lib/communications/email-sync.ts), [webhook Resend](../src/app/api/webhooks/resend/route.ts), [engine.ts](../src/lib/automations/engine.ts) |
| AUTO-02 | P0 | Unicité du run : un événement déjà enregistré est ignoré, même si le run a échoué. Pas de checkpoint par action ; une panne après une tâche/notification ne permet pas une reprise sûre. Un crash peut laisser `RUNNING`. | `runAutomationEvent` dans [engine.ts](../src/lib/automations/engine.ts), `AutomationRun` dans [schema.prisma](../prisma/schema.prisma) |
| AUTO-03 | P1 | Le moteur lit les conditions/actions mutables du workflow, pas un snapshot publié lié au run. L'audit d'une ancienne exécution ne peut pas garantir la configuration effectivement utilisée. | [engine.ts](../src/lib/automations/engine.ts), `AutomationWorkflowVersion`, `AutomationRun` |
| AUTO-04 | P1 | Réinscrire remet le même enrollment à la première étape ; les livraisons/tâches uniques de cet enrollment subsistent. Définir reprise ou nouvelle occurrence évite un redémarrage incohérent. | `enrollLeadInSequenceInternal` dans [sequences.ts](../src/lib/automations/sequences.ts) |
| AUTO-05 | P2 | Neuf déclencheurs, quatre actions élémentaires, un niveau de branche. `delayHours` donne une échéance à une tâche créée immédiatement, sans attente durable du scénario. Historiques bornés à quelques runs/livraisons. | [engine.ts](../src/lib/automations/engine.ts), [automations](../src/actions/automations/index.ts) |
| OPS-01 | P0 | Baux de 15 minutes sans renouvellement/fencing ; une tâche plus longue peut continuer après une nouvelle prise de bail. Les appels HTTP des adaptateurs n'ont pas de deadline explicite. | [lease.ts](../src/lib/processing/lease.ts), fetch dans `communications` et `email-oauth.ts` |
| OPS-02 | P1 | Traitements cron séquentiels toutes les cinq minutes, désactivés sans variable. Un premier processeur en erreur bloque les suivants ; ce scheduler n'est pas une preuve de fonctionnement autonome continu. | [production-processors.yml](../.github/workflows/production-processors.yml) |
| OPS-03 | P1 | L'expéditeur implicite est la dernière boîte mise à jour. Ajouter/reconnecter une boîte peut déplacer les prochains envois automatiques ; quotas par boîte et équité entre sociétés restent à formaliser. | `activeCommunicationChannel` dans [email-provider.ts](../src/lib/communications/email-provider.ts), traitement des séquences |
| CS-01 | P1 | Santé client limitée aux 300 premiers clients, avec sous-ensembles bornés de tickets/factures/contrats. Recalcul global et KPI de portefeuille ne couvrent pas forcément toute la société. | [customer-success](../src/actions/customer-success/index.ts) |
| CRM-01 | P1 | Fournisseurs/sites/dépôts/équipements disposent de créations et lectures, mais pas d'un cycle d'édition/désactivation métier complet retrouvé. Les mises à jour d'import/transfert ne remplacent pas ce parcours. | [operations](../src/actions/operations/index.ts), recherches des mutations de ces modèles dans `src` |
| PORTAL-01 | P1 | Confirmer une demande de rendez-vous modifie son statut, sans réservation/calendrier atomiquement associé dans cette action. Le portail est un parcours de demande, pas encore un agenda de réservation complet. | `updateClientPortalAppointment` dans [portal](../src/actions/portal/index.ts) |
| BANK-01 | P1 | Import et rapprochement manuels présents ; lecture des 250 dernières transactions et 100 dépenses. Les anciennes lignes ne sont pas accessibles par ce tableau au-delà de la limite. Connexion bancaire automatique non implémentée. | [bank](../src/actions/bank/index.ts) |
| EXT-01 | P3 | Modèles `ApiKey`, `WebhookEndpoint`, `WebhookDelivery` ne suffisent pas à fournir une API publique/outbound webhooks : pas de parcours complet retrouvé. Pas d'autres connecteurs métier OAuth que Google/Microsoft mail/calendrier. | [schema.prisma](../prisma/schema.prisma), inventaire de `src/actions`, `src/app/api` et `src/lib/integrations` |

Les limites d'affichage ne sont pas toutes des erreurs de calcul. Par exemple, les statistiques principales utilisent des agrégats SQL ; le [reporting direction](../src/lib/reporting-data.ts) signale explicitement les sources dépassant 20 000 lignes. Conserver ces propriétés et qualifier chaque autre liste/KPI séparément.

## 4. Architecture retenue

Conserver Next.js/React/TypeScript, Prisma/PostgreSQL, le monolithe modulaire et BullMQ/Redis déjà utilisés pour les PDF. Aucun écart ci-dessus ne justifie de réécrire le produit dans une autre stack. Lire les guides de la version Next installée avant toute modification d'application ; les décisions de maintenance Prisma/Auth.js restent une qualification distincte, avec migrations et compatibilité testées.

Ajouter progressivement des contrats de domaine typés, des états métier validés et des traitements durables. Une outbox SQL enregistre un événement dans la transaction de la mutation ; un processeur existant le distribue avec retries. Une inbox et des clés par effet empêchent la répétition des mutations. SQL demeure la source de vérité : une file ne remplace pas l'historique, et un crash entre SQL et Redis ne doit pas perdre le travail.

Capturer l'identité et le contexte métier nécessaires au moment de l'événement. Distinguer une condition évaluée à cette date d'une condition réévaluée après une attente ; conserver cette décision avec la version du scénario. Sinon un changement ultérieur du prospect rend la reproduction d'une ancienne exécution impossible.

Réutiliser BullMQ lorsque délais, concurrence et retries le rendent utile ; ne pas imposer Redis aux simples lectures ou créer deux moteurs de scheduling concurrents. Choisir dans une ADR un propriétaire d'exécution unique pour chaque famille de travaux, avec une reprise déterministe. Kafka, microservices et moteur de workflow supplémentaire ne sont pas nécessaires à ce périmètre. Une réévaluation d'un moteur spécialisé n'aurait de sens qu'après mesure de scénarios durables complexes devenus difficiles à maintenir.

Séparer les capacités d'intégration : envoi, réception, calendrier, pièces, webhooks. Chaque connexion possède un expéditeur explicite, des ACL, un état par capacité, un curseur indépendant et une politique de reprise. Les tokens restent chiffrés ; les mises à jour concurrentes doivent être atomiques/versionnées. Les journaux exposent des identifiants de corrélation et des codes d'erreur bornés, sans tokens ni contenu sensible.

## 5. Lots exécutables dans l'ordre

Tailles indicatives après reproduction : **S** 1–2 jours, **M** 3–5 jours, **L** 6–10 jours de développement concentré ; **XL** à découper avant engagement. Ce sont des ordres de grandeur, pas un calendrier garanti. Le budget financier de 0 € reste indépendant du temps de développement. Chaque lot termine par sa recette et un commit cohérent ; toute modification visible passe d'abord par le lot de confirmation correspondant.

### L0 — Reproductions et contrat de comportement [S]

Créer des fixtures sur base isolée et des fournisseurs HTTP contrôlés : mail paginé, token expiré/tournant, panne SQL après acceptation distante, webhook rejoué, segment au-delà de 5 000, campagne future/en pause et workflow interrompu. Capturer les symptômes du registre, versions, commandes, comptes/rôles et résultats attendus. Corriger la classification lorsqu'une hypothèse n'est pas reproduite.

Définir les invariants : pas d'envoi hors état autorisé ; pas de disparition de données à cause d'une limite ; pas d'effet métier doublé au rejeu ; pas d'accès inter-société/boîte ; résultat partiel explicitement identifiable. Distinguer accepté par fournisseur, livré, rejeté et résultat inconnu.

**Acceptation** : MAIL-01/03/07, MKT-01, CAMP-01, AUTO-01/02 et OAUTH-01 disposent chacun d'une reproduction minimale ou d'une justification documentée d'infirmation. Aucun test n'utilise la base ou les comptes existants.

### L1 — Corriger d'abord les incohérences immédiates [M]

Traiter MKT-01 : parcours complet avec ordre stable et génération identifiée, résultats construits par batches, publication uniquement après fin réussie. Préserver la dernière génération valide en cas d'échec. Ne pas simplement retirer le `take` pour charger tout en mémoire.

Traiter CAMP-01 et OPS-03 : contrôler campagne active/date de début/date de fin à l'inscription **et immédiatement avant envoi** ; formaliser pause, reprise, clôture et emails déjà engagés. Fixer la boîte expéditrice au niveau de la séquence/campagne et refuser une substitution silencieuse. Clarifier nouvelle inscription/reprise pour AUTO-04 avant de modifier les clés de déduplication.

**Acceptation** : 5 001 puis 10 001 prospects correctement scorés/segmentés, dont des membres préexistants hors premier batch ; crash de recalcul ne remplace pas le segment valide. Campagne future/en pause/clôturée : zéro nouvel appel d'envoi après observation de cet état, y compris changement concurrent avant dispatch. Une boîte ajoutée ne change pas l'expéditeur d'une séquence existante. Un envoi déjà accepté ne peut pas être « annulé » rétroactivement.

### L2 — Envois, événements et scénarios durables [XL, découper en trois PR]

1. Commande d'envoi persistée avant appel distant, clé stable, payload et boîte figés, état préparé/brouillon conservé, acceptation/résultat ambigu/réconciliation distincts. Reprendre les mécanismes déjà présents dans les séquences pour l'envoi manuel et réparer l'historique après acceptation. Empêcher l'envoi automatique aveugle après expiration de la déduplication fournisseur.
2. Outbox transactionnelle pour événements métier et webhooks ; inbox durable, publication/version immuable liée au run, checkpoints d'actions avec identifiants stables et reprise uniquement des étapes incomplètes. Les mutations SQL et leur checkpoint partagent une transaction lorsque possible ; les effets distants utilisent un protocole de reprise explicite. Identifier et réconcilier les runs abandonnés.
3. Deadlines HTTP, erreurs transitoires/définitives/authentification/quotas, backoff, bail renouvelable et contrôle de perte de propriété avant effets. Travaux bornés et continuations, journal de tentative et rejeu audité. Un webhook acquitté a au minimum persisté le travail à faire.

**Acceptation** : crash à chaque frontière SQL/fournisseur/action/ack, double clic, deux workers, répétition et désordre de webhooks. Une tâche/notification créée ne se répète pas ; les étapes suivantes reprennent ; aucune version différente ne s'applique à un ancien run. Une requête bloquée expire. Perte du bail interdit au worker ancien de produire de nouveaux effets. Pour un envoi ambigu non vérifiable, conserver un état à résoudre au lieu de promettre un « exactement une fois » universel.

### L3 — Cycle OAuth, visibilité et isolement des connexions [L]

Finir OAUTH-01/02/03/04 et MAIL-07 : verrou/version sur refresh, rotation sans écrasement du curseur, single-use state par connexion, callbacks nettoyés sur toutes les sorties, contrôles des scopes effectivement accordés et états de reconnexion. Séparer autorisation calendrier et mail quand utile, avec consentement progressif. Maintenir une matrice claire Google/Microsoft professionnel ; comptes personnels Microsoft seulement après décision et qualification.

Décider boîte partagée ou privée ; propriété, délégation, agence et permissions d'envoi/lecture/admin doivent être appliquées au serveur. Identifier chaque message, conversation, événement et clé d'idempotence dans l'espace de sa société/connexion. Migrer les anciens messages sans rattachement certain dans un état explicite à réconcilier. Distinguer déconnexion locale, suppression des données retenues et révocation distante réellement disponible chez le fournisseur.

**Acceptation** : deux refresh simultanés avec token tournant ; curseur écrit pendant refresh ; révocation distante ; scope refusé ; compte incorrect ; callback rejoué/expiré ; deux connexions ouvertes en parallèle. Deux sociétés et deux boîtes avec identifiant fournisseur identique restent indépendantes. Un rôle sans ACL ne lit aucun message ni pièce, y compris par URL/API/export. Aucun secret n'atteint navigateur, logs ou rapport.

### L4 — Synchronisation mail/calendrier complète et reprenable [L]

MAIL-01/02/05, CAL-01 et OPS-02 : initialisation paginée selon un périmètre choisi, Gmail history et delta Graph par dossier, continuation persistée avant la limite du job, checkpoint final seulement après capture complète. Réconcilier messages existants, lecture et suppressions selon une politique explicite. Identifier les conversations distantes et participants ; ne pas fusionner par le seul sujet.

Séparer les jobs/états mail et calendrier, y compris panne de l'un ; ne pas perdre le prochain processeur parce que le précédent échoue. Continuer au-delà de dix pages, réinitialiser un curseur expiré et faire progresser l'horizon calendrier. Traiter conflits d'édition via version/etag, annulation distante, récurrences, journée entière et changements d'heure avant de prétendre à une synchronisation bidirectionnelle complète.

**Acceptation** : 51/151 messages par dossier, backlog ancien et arrivée pendant initialisation ; messages lus/déplacés/supprimés ; deux inconnus au même sujet séparés. Calendrier de onze pages, crash en page 3, curseur invalide, erreur mail avec succès calendrier, et inversement. Après plusieurs jobs, totalité du périmètre annoncé sans omission ni doublon. Les états affichés reflètent les succès partiels.

### L5 — Boîte e-mail utilisable au quotidien [L]

MAIL-04/06 : brouillons utilisateur autosauvegardés et versionnés, destinataires/CC/CCI validés, répondre/répondre à tous/transférer, signature et version texte, pièces locales et documents CRM, programmation/annulation avant dispatch. Différencier courriel de service et prospection avec règles de consentement/suppression appropriées.

Recherche et pagination serveur des fils/messages/contacts, archives consultables et restaurables, filtres par boîte/état/assignation, derniers messages visibles et historique chargeable. Pièces entrantes/sortantes : limites explicites, droits, hash, durée, stockage privé, traitement des contenus dangereux et téléchargement authentifié ; pas de chargement arbitraire d'URL distante fourni par un utilisateur.

**Acceptation** : reprise d'un brouillon après navigation/conflit d'onglets ; dernier message d'un fil de 101 messages accessible ; contact 501 trouvable ; pièce refusée proprement si trop grosse ; utilisateur interdit ne peut la télécharger. Réponse Gmail/Graph rejoint la conversation distante ; double envoi et annulation concurrente sont qualifiés avec L2. Aucun BCC ne fuit aux autres destinataires ou dans une vue non autorisée.

### L6 — Marketing administrable et audiences fiables [L]

MKT-02/03 et CS-01 : édition, duplication, archivage des règles/segments avec audit, preview du score et explication des critères ; listes statiques add/remove/import avec déduplication ; segments dynamiques versionnés, inclusions/exclusions, pagination et état du recalcul. Généraliser le traitement complet au score de santé client, avec agrégats exacts au lieu de listes tronquées.

Exploiter le journal de consentements existant : préférences par finalité/canal, origine et version de notice, retrait idempotent, distinction notifications nécessaires/marketing, import sans création implicite de consentement. Prévoir confirmation d'inscription lorsque adaptée au parcours réel ; simuler ce parcours dans la démo. Les règles juridiques de l'exploitation réelle restent à valider avec son entité.

**Acceptation** : cycle créer → prévisualiser → modifier → archiver → retrouver l'historique ; segment statique réellement peuplable ; membre 101 accessible ; critères combinés et absence de champ traitées ; clients 301 et factures 501 inclus dans les scores/KPI. Retrait entre sélection et dispatch empêche un envoi marketing, sans transformer automatiquement toute notification de service en marketing.

### L7 — Campagnes et automatisations suffisamment profondes [XL, découper]

Achever CAMP-02/03 : édition, préflight de contenu/liens/domaine/quota/consentement, test sur destinataire explicitement autorisé, audience figée avec exclusions motivées et compteur de progression, activation reprenable, pause/reprise/clôture. Enregistrer séparément les événements livrés/ouverts/cliqués/rebondis, dénominateurs et destinataires uniques. Qualifier les métriques comme signaux techniques, sans déduire une ouverture humaine d'un clic. Ajouter un entonnoir prospect → opportunité → devis → commande/revenu avec modèle d'attribution explicite et budget consommé.

Après L2, approfondir AUTO-05 : attendre une durée/date/événement de façon durable ; tâche achevée, changement d'étape, devis accepté, paiement, stock/SAV/maintenance comme événements utiles ; groupes de conditions typés et compatibles avec l'objet. Définir cooldown, anti-boucle, exclusion, occurrence d'inscription, fuseau et version. Journal paginé par action, simulation sur version, pause/annulation et reprise humaine auditées. Chaque nouvelle action possède ses propres règles de droits et déduplication.

**Acceptation** : parcours prospect capturé → score → segment → campagne planifiée → email → réponse → arrêt → tâche commerciale ; parcours devis accepté → préparation → intervention → SAV/maintenance. Attente survivant à un redémarrage et à un changement d'heure ; boucle de statuts bornée ; métriques reproductibles depuis le journal d'événements. Changement de version ne modifie pas les runs en cours.

Tests A/B et optimisation avancée sont P2 après des métriques fiables. Un graphe visuel complexe, SMS, diffusion sociale/Ads ou un éditeur de landing pages sont P3 : ils demandent besoin validé, coûts/API et confirmation UI. Les ressources de campagne existantes restent un suivi documentaire tant que la diffusion n'est pas implémentée.

### L8 — Fermer les autres parcours métier [XL, par domaine]

Les lignes ci-dessous sont des objectifs de qualification/complétion, pas l'affirmation que chaque fonction citée manque. Examiner d'abord les capacités existantes pour éviter de les reconstruire.

| Sous-lot | Existant | Complément / recette de fermeture | Priorité |
|---|---|---|---|
| CRM/vente | Clients, contacts, propriétés, pipelines, activités, vues | Déduplication/fusion sûre et réversibilité ; transitions obligatoires, propriétaire et prochaine action ; bulk/export avec mêmes filtres/droits ; propriétés requises appliquées aux entrées pertinentes ; recherche à volume réel. Prévision multi-période et approbations selon besoin. | P1, extensions P2 |
| Référentiels | Fournisseurs, sites, dépôts, équipements ; catalogue éditable | CRM-01 : corriger coordonnées/affectation, désactiver/réactiver sans casser historique, empêcher suppressions liées, retrouver ancien objet ; différencier équipement/site/référence produit. | P1 |
| Devis/contrats/projets | Versions, signature, avenants, conversion, jalons, réception | Recette rejet/expiration/avenant puis conversion cohérente ; changements de prix après signature ne modifient pas archives ; planning, marge et réception reliés ; récupérer ou signaler documents historiques sans snapshot. | P1 |
| Achats/stock | Commandes, approbation, réception partielle, anomalies, retour, réservation | Qualifier commande fournisseur → livraisons partielles → reliquat → litige → retour/avoir ; deux réservations concurrentes ; annulation chantier ; inventaire/ajustements et traçabilité. Ajouter édition/cancel là où le parcours ne le permet pas. | P1 |
| Planning/portail | Tâches, interventions, demandes de rendez-vous, messages/documents | PORTAL-01 : confirmation liée à une réservation et notifications ; collision de créneau, capacité/durée, replanification/annulation et fuseau. Qualifier invités/free-busy après CAL-02. Accès expiré/révoqué et pièces privées sur tous les points d'entrée. | P1 puis P2 |
| Terrain/hors ligne | PWA terrain, reprise d'intervention et pièces | Deux appareils, clôture concurrente, connexion fluctuante, retries, photo/stock/frais/signature ; conflit explicite et récupération de la saisie. CRM complet hors ligne hors périmètre immédiat. | P1 |
| SAV/maintenance | Tickets, notes/fils, fusion, SLA, guides, enquêtes, renouvellement | Ticket entrant assigné → réponse → intervention → clôture → satisfaction ; lien fil/contact sans confusion ; relance après réouverture ; SLA/horaires/escales ; renouvellement avec avenant et facture sans doublon. | P1 |
| Finance/banque | Factures archivées, avoirs, acomptes/paiements, récurrence, dépenses, import/rapprochement | Paiement partiel/solde/trop-perçu/remboursement/avoir, double import, annulation du rapprochement, TVA/arrondis/export/recurrence ; BANK-01 pagination. Banque automatique et plateforme e-facturation demandent un projet fournisseur distinct. | P1, connecteurs P3 |
| Direction/analytique | KPI SQL, reporting avec avertissement de troncature | Définition de chaque indicateur : encaissement/CA/marge, période/fuseau/devise/statut ; droits identiques aux données sources ; chiffres rapprochables aux écritures et exports. Ne pas annoncer un total complet si une source est partielle. | P1 |
| Imports/migrations | HubSpot, import fichiers, simulation, mapping, vérification | Reprise par batch, erreurs par ligne, déduplication, update vs création, ancien schéma, limites/compte fournisseur ; import avec pièces/liens et rapport de rapprochement. API Extrabat non disponible : maintenir cette limite explicite. | P1, qualification externe |
| Équipe/agences/auth | Invitations, rôles, agences, MFA, révocation, audit | Owner/Admin/Sales/Operations/Technician/Service/Accounting/Viewer : lecture, URL directe, fichier, export, mutation et tâche de fond ; départ d'un membre, transfert d'agence, révocation de session/invitation ; extension ACL de boîte L3. | P1 |
| Notifications/préférences | Notifications internes et emails de sécurité/service | Éviter répétition, statuts lus/archivés, liens utiles, préférences par événement/canal, suivi échec ; séparer notifications nécessaires, marketing et messages de test. | P1/P2 |
| Usage quotidien/accessibilité | Interfaces desktop/mobile et états de démo | État vide/chargement/erreur/retry, saisie conservée, validation serveur et conflit de modification ; clavier/focus/libellés/lecteur d'écran, formulaires mobiles, fuseaux et formats monétaires. Les correctifs visibles restent soumis à confirmation précise. | P1 |
| Confidentialité/réversibilité | Consentement, export utilisateur/société, anonymisation, backup | Cartographier chaque donnée/fichier/token, rétention par finalité, export autorisé et restauration sur environnement neuf ; effacement compatible avec archives requises ; incidents et responsable avant réel. | P1 technique, gate réel |
| Abonnement/paiement SaaS | Intégration technique Stripe et limites de plan | Démo : aucun encaissement. Si SaaS décidé : checkout/webhooks sandbox, changement/résiliation, événements désordonnés, factures, droits et réconciliation ; coûts/contrats validés avant live. | P3 |

**Acceptation** : chaque sous-lot retenu possède un E2E positif, au moins un cas d'échec métier et un contrôle de rôle/volume pertinent ; résultats et limites reliés au registre. Ajouter des tests d'intégration ciblés sur argent, stock, concurrence, documents figés et hors ligne. Ne pas générer des tests qui recopient simplement le code.

### L9 — Qualification finale et dossier de revue [M]

Vérifier les trois couches : SQL réel pour invariants/concurrence, HTTP fournisseur simulé pour protocole/pannes, navigateur pour parcours/permissions. Utiliser des fixtures explicites et indépendantes, une horloge contrôlable et des assertions de résultats, pas des délais allongés ni des retries qui cachent un défaut.

Élargir la couverture ciblée aux moteurs modifiés selon les risques. Conserver CI SQLite/PostgreSQL/Linux et E2E desktop/mobile ; lister les exclusions et empêcher de présenter les services simulés comme fournisseurs validés. Tester pagination, export et recalcul sur 10 000+ objets fictifs, interruptions/redémarrages et quota fournisseur. Les temps et budgets mémoire sont mesurés sur une machine nommée avant de fixer des SLO.

Préparer trois démonstrations reproductibles : acquisition/vente, exécution/facturation, SAV/maintenance. Pour chacune : données crédibles fictives, commande de préparation, scénario nominal, panne/reprise, rôles, preuves du commit, limites connues et décisions techniques. Fournir un état des connecteurs avec les trois niveaux « simulé », « compte test qualifié », « exploitation qualifiée ».

**Acceptation** : tous les P0 reproduits sont corrigés ou explicitement infirmés ; tous les P1 du périmètre vitrine sont terminés/qualifiés ; revue des licences/secrets, restauration et installation sur machine neuve ; CI du SHA candidat et preuves archivées concordent. Aucun bouton/action présenté comme opérationnel sans contrat et scénario de bout en bout.

## 6. Dépendances et jalons

| Ordre | Dépend de | Résultat attendu |
|---|---|---|
| L0 → L1 | Reproduction et invariants | Fin des premières incohérences de segments/campagnes/enrollments/expéditeur |
| L2 | L0 ; contrats de statut L1 | Commandes/événements/run durables, reprise sûre et baux bornés |
| L3 | L0 ; mécanismes de concurrence L2 | OAuth et cloisonnement des boîtes défendables |
| L4 | L2–L3 | Synchronisation complète ; progression réelle sans succès trompeur |
| L5 | L2–L4 ; approbation UI | Inbox et envoi quotidiens terminés |
| L6 | L1–L2 ; approbation UI | Marketing administrable, audiences et scores complets |
| L7 | L2–L6 ; approbation UI | Campagnes pilotables et scénarios métier durables |
| L8 | L1–L3 pour communications/jobs ; qualification par domaine | Chaîne métier cohérente sans impasse |
| L9 | Lots du périmètre retenu | Dossier de preuve du candidat et démo CTO |

**Jalon A — socle fiable** : L0–L4 et tests P0. **Jalon B — produit démontrable complet dans son périmètre** : L5–L9 et P1. **Jalon C — extensions/intégrations réelles** : P2/P3 choisis après ces jalons, avec qualification fournisseur. Une capacité externe peut être démontrée avec simulateur au jalon B si la limite est annoncée clairement ; elle ne devient pas « opérationnelle chez Google/Microsoft » pour autant.

Pour commencer : reproduire les quatre cas backlog mail, segment 5 001, campagne en pause, scénario interrompu ; corriger ensuite L1, puis découper L2 en trois PR. Ne pas ajouter de nouveau connecteur tant que ces invariants ne tiennent pas.

## 7. Lots visibles à soumettre à confirmation

Ce plan ne vaut pas confirmation de changements visibles. Les autorisations précédentes pour les mentions de démo, Gemini et PDF émis figés restent acquises ; les ajouts ci-dessous nécessitent une proposition précise avant mise en œuvre. Préparer d'abord les contrats/tests et une description ou maquette reviewable ; demander uniquement la décision encore manquante.

| Lot UI | Proposition concrète | Lié à |
|---|---|---|
| UI-01 | Afficher la boîte expéditrice et les états d'envoi « en attente/accepté/livré/échec/à vérifier » ; expliquer pause et date de campagne. | L1–L2 |
| UI-02 | Ajouter choix boîte privée/partagée, droits et capacités mail/calendrier ; boutons reconnecter/déconnecter avec explication exacte ; afficher dernier succès/erreur par capacité. | L3–L4 |
| UI-03 | Ajouter champs CC/CCI, pièces, signature, brouillons, répondre à tous/transférer, programmation ; filtres, pagination et accès aux archives. | L5 |
| UI-04 | Ajouter modifier/dupliquer/archiver règle/segment, membres de liste statique, preview et progression ; préférences de consentement. | L6 |
| UI-05 | Ajouter préflight et confirmation d'activation campagne, audience/exclusions, progression et métriques expliquées ; journal d'actions, attente et reprise de scénario. | L7 |
| UI-06 | Ajouter édition/désactivation des référentiels manquants, pagination banque, réservations portail et gestion explicite des conflits terrain. Découper par écran. | L8 |

Couleurs, remplacement de boutons, disposition, nouvelles pages et libellés seront explicités dans chaque demande concernée. Les tests techniques et corrections serveur déjà autorisés peuvent avancer indépendamment, en vérifiant les effets attendus sur les parcours existants.

## 8. Connecteurs et contraintes externes vérifiées

| Service | État / décision | Preuve de qualification à obtenir |
|---|---|---|
| Resend | Envoi/réception/webhooks présents ; améliorer reprise et domaine/quotas. | Domaine de test, SPF/DKIM/DMARC selon usage, envoi autorisé, réception/réponse/pièce, événements rejoués, rebond/plainte et déduplication. |
| Google mail/calendrier | OAuth présent, usage réel non qualifié dans cette livraison ; périmètre et scopes à réduire selon besoins. | Projet OAuth, comptes de test dédiés, consentement, refresh/révocation, pagination/history, réponse et calendrier après panne. |
| Microsoft 365 | OAuth professionnel présent, scope/tenant à expliciter ; comptes personnels non couverts actuellement. | App Entra, consentement administrateur si requis, boîte/calendrier test, refresh, delta, permissions et throttling. |
| HubSpot / Extrabat | Migrations par API/fichiers selon support ; pas une synchronisation bidirectionnelle continue. | Droits/export/contrat réel et corpus anonymisé ; éviter une promesse d'API Extrabat actuellement absente. |
| Drive / OneDrive | Non implémentés comme connecteurs métier. P3 après validation d'un besoin de documents. | Choix de fichiers et droits minimaux, stockage/lien privé, modification/révocation et politique de copie ; pas de synchronisation de tous les dossiers par défaut. |
| Slack / Teams | Notifications métier externes non implémentées. P3 si une agence en a besoin. | Un canal de test, secret/revocation, droits, quotas, idempotence et exclusions de données. |
| API publique / webhooks sortants | Modèles présents, service complet non implémenté. P3 préférable à multiplier les connecteurs ad hoc si besoin confirmé. | OpenAPI versionnée, tokens hashés/scopes/rotation, signatures, replay, protection SSRF, quotas, journal/retries et dead-letter. |
| SMS / social / Ads / banque / e-facturation | Pas de diffusion/intégration complète à revendiquer sur la base des seules ressources ou modèles. | Fournisseur, cas d'usage, coût, règles et sandbox ; lot distinct, hors engagement 0 €. |

Contraintes vérifiées dans les documentations officielles le 2 octobre 2026 :

- Gmail `gmail.modify` est un scope restreint. Minimiser les droits ne supprime pas automatiquement les exigences de vérification pour une boîte complète ; examiner les exceptions et, selon l'accès serveur aux données, l'évaluation de sécurité avant ouverture publique. La démo ne doit pas dépendre d'une validation fournisseur non obtenue. [Scopes Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes), [vérification Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).
- Un projet Google externe en statut Testing délivre normalement un refresh token de sept jours pour ces scopes. Prévoir cette expiration dans la recette ; ne pas la traiter comme une panne mystérieuse de Freelio. [Cycle OAuth Google](https://developers.google.com/identity/protocols/oauth2).
- Gmail history exige une réinitialisation lorsque son historique n'est plus disponible ; Graph delta doit suivre les continuations jusqu'au checkpoint final. Définir aussi le périmètre importé : exhaustif dans une période/dossiers annoncés, sans promettre tout l'historique par défaut. [Synchronisation Gmail](https://developers.google.com/workspace/gmail/api/guides/sync), [delta des messages Graph](https://learn.microsoft.com/en-us/graph/delta-query-messages).
- Gmail demande la référence de thread et des en-têtes de réponse compatibles pour joindre une conversation distante. Une association SQL locale seule est insuffisante. [Threads Gmail](https://developers.google.com/workspace/gmail/api/guides/threads).
- Graph retourne des 429 et un délai `Retry-After` à respecter ; prévoir backoff et quotas par connexion. [Throttling Graph](https://learn.microsoft.com/en-us/graph/throttling).
- Resend garde ses clés d'idempotence pendant 24 heures. La reprise durable après cette fenêtre doit résoudre l'état ambigu plutôt que renvoyer sans contrôle. [Idempotence Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).
- Délivrabilité et désinscription varient selon le type/volume d'envoi ; conserver la séparation marketing/service et le mécanisme en un clic existant. Qualifier domaine et règles avant une campagne réelle. [Consignes expéditeurs Gmail](https://support.google.com/mail/answer/81126?hl=en-GB), [abonnements](https://support.google.com/mail/answer/15263077?hl=en-GB).

À 0 € : développement local, PostgreSQL/Redis isolés, faux fournisseurs HTTP, fixtures et preuves. Les dépenses d'hébergement, domaines, vérifications payantes éventuelles ou abonnements nécessitent un coût final approuvé. Connexion à un compte externe réel, envoi réel, publication/déploiement et ouverture commerciale font l'objet de leur décision dédiée ; aucun de ces actes n'est nécessaire pour achever ce plan.

## 9. Définition de « terminé » et suivi

Un ticket se ferme seulement lorsque son résultat utilisateur et ses cas d'échec sont vérifiés, que ses droits/volumes/reprises sont couverts selon le risque, que la migration et la compatibilité des données sont qualifiées, et que son interface approuvée explique les limites restantes. Décrire l'implémentation, le SHA, les commandes et les preuves dans un suivi daté. Un commit, un bouton ou une ligne de schéma ne suffisent pas.

États de suivi : **à reproduire → reproduit/infirmé → spécifié → en cours → recette locale → CI du SHA → qualifié**, avec sous-état **qualification fournisseur en attente** lorsqu'applicable. Toute exclusion conserve sa raison et son impact. Ne pas marquer un lot entier terminé parce qu'un seul test nominal passe.

Pour chaque PR : identifiants du registre traités, exemple avant/après, périmètre UI approuvé, migrations, tests utiles, résultat de CI exact et limites externes. Mettre à jour la matrice de couverture après validation, sans réécrire les anciens comptes rendus. La revue CTO doit pouvoir expliquer un choix technique, montrer une panne récupérée et retrouver la preuve correspondante.
