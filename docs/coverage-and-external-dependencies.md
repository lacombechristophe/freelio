# Capacités et limites

Freelio est un cas d’étude métier avec une démonstration fictive en lecture seule. La présence d’un modèle, d’un écran ou d’un test ne suffit pas à qualifier un remplacement de logiciel ou un service commercial.

## Périmètre du code

| Domaine | Parcours présents | Limites à retenir |
| --- | --- | --- |
| CRM et vente | Clients, contacts, prospects, pipeline, propriétés, devis versionnés, commandes et contrats | Import réel, rapprochement historique, règles commerciales et preuve de signature à recetter avec l’entreprise |
| Finance | Calculs en centimes, acompte/solde, temps, paiements, avoirs, banque, récurrences et archives | Pas de certification Factur-X ni de validation comptable ou réglementaire globale |
| Communications | Boîtes privées/partagées, synchronisation mail/calendrier, fils, brouillons, pièces, programmation, réponses et reprise des résultats incertains | Comptes Google/Microsoft/Resend, consentements OAuth, révocation distante et délivrabilité réels à qualifier |
| Marketing et automatisations | Règles, segments, listes statiques, campagnes, audience figée, séquences, attentes durables, simulation et journaux | Pas de plateforme publicitaire/sociale ; attribution avancée, tests A/B et très gros volumes non qualifiés |
| Opérations | Sites, équipements, fournisseurs, achats, réception/retours, stocks, réservations, transferts, livraisons, SAV et entretien | Pas d’EDI fournisseur, d’optimisation de tournées ou de valorisation comptable avancée des stocks |
| Organisation et terrain | Tâches, objectifs, temps, planning dans le fuseau société et parcours terrain avec brouillons hors ligne | Pas de fusion automatique de rapports concurrents ; appareils physiques et usages terrain réels à recetter |
| Portail et documents | Liens temporaires, documents, messages, rendez-vous CRM, aide, questionnaires et signatures | Identité, durées de conservation et portée juridique à valider avant ouverture à de vrais clients |
| Reprise et exploitation | Analyse, simulation/import, rapports, export logique, sauvegardes locales, image Linux et worker | Pas de suppression atomique globale d’un import ; restauration isolée obligatoire avant répétition |

Les contrats détaillés et les régressions associées restent accessibles dans les [archives](history.md). La [structure du code](architecture-domain-boundaries.md) indique où vérifier les règles courantes.

## Démonstration hébergée

La démo utilise PostgreSQL avec un rôle lecteur et Upstash pour le limiteur distribué. L’entrée ouvre une session visiteur au compte fictif, sans demander d’identifiants. Elle interdit les mutations, les processeurs et les connexions fournisseur côté serveur. Aucun bucket R2 n’est configuré. Les PDF de brouillons sont calculés à la demande ; une archive absente n’est pas reconstruite comme un original.

Les comptes fournisseur, e-mails et calendriers montrés par les fixtures ne prouvent pas qu’une boîte réelle est connectée. Le profil de démonstration ne doit recevoir aucune donnée réelle. La démo locale isolée permet des mutations fictives avec ses propres données et fichiers.

## Avant une exploitation modifiable

| Dépendance | Qualification nécessaire |
| --- | --- |
| PostgreSQL | Rôles distincts, migrations depuis la version existante, charge, sauvegarde native et restauration vérifiée |
| Stockage privé | Fichiers et archives, clés, contrôle d’accès, inventaire, rétention et restauration conjointe avec SQL |
| Mail et calendriers | Comptes autorisés, domaine d’envoi, authentification, webhooks, synchronisation, quotas, révocation et reprise des erreurs |
| Redis et ordonnanceur | Worker actif, baux, délais, reprise après arrêt, supervision et protection contre les doublons |
| Hébergeur | Ressources Chromium, isolation du rendu, limites d’exécution, journaux, alertes et retour compatible |
| Organisation cliente | Règles métier, droits, responsables, données personnelles, conservation, support et objectifs de récupération |

Les [tests](testing.md) couvrent des corpus fictifs et des risques ciblés. Les essais de récupération natifs ne démontrent pas un PRA chez l’hébergeur ; aucun RPO/RTO ou SLA n’est annoncé. La couverture automatisée ne vaut pas certification WCAG. Le zoom Chrome réel a été contrôlé sur onze surfaces de la démo à 200/400 % ; Safari iPhone et Chrome Android physiques restent à qualifier.

Le [runbook d’exploitation](production-runbook.md) décrit les opérations à préparer. Le [runbook de bascule](migration-cutover-runbook.md) garde une décision métier distincte avant import réel, changement de trafic ou résiliation d’un autre outil.
