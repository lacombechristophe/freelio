# Rapport de vérification du candidat CRM/ERP

Date : 31 août 2026
Branche : `codex/diskoov-crm-replacement`
Portée : code, bases de recette locales, migration PostgreSQL, déploiement Vercel et recette publique ; les comptes HubSpot/Extrabat et les fournisseurs externes ne sont pas inclus.

## Résultat synthétique

Le candidat du dépôt est cohérent, compilable et déployable sur PostgreSQL. Les flux centraux CRM, vente, opérations, finance, migration, e-mails, automatisations, scoring, portail et réversibilité ont des preuves automatisées. La résiliation réelle de HubSpot et Extrabat demeure un **no-go** tant que les exports réels, rapprochements, services externes et décisions métier de la matrice de couverture ne sont pas signés.

## Preuves exécutées

| Contrôle | Résultat |
|---|---|
| `npm run db:generate` | clients SQLite et PostgreSQL générés |
| `npm run typecheck` | réussi |
| `npm run lint` | réussi |
| `npm run test:unit` | 47 fichiers, 185 tests réussis |
| `npm run build` | build Next.js 16.3.3 de production réussi, 69 sorties statiques générées et routes dynamiques compilées |
| `npm audit --audit-level=moderate` | 0 vulnérabilité déclarée |
| Playwright, base isolée | 21 scénarios desktop/mobile réussis et 13 mutations volontairement ignorées sur mobile après preuve desktop (34 exécutions) |
| Playwright ciblé, lot dossiers métier | fiche opportunité et activité (desktop), chaîne help desk → ticket → équipement → intervention (desktop et mobile), workflow achat → dossier commande → dossier fournisseur (desktop) réussis |
| Playwright ciblé, contrats | proposition de renouvellement → signature → nouveau terme et contrat signé → avenant structuré → PDF/traçabilité réussis sur desktop |
| PostgreSQL | 34 migrations versionnées, dont réparation historique idempotente, campagnes marketing, connaissance, satisfaction, vues persistées, automatisations avancées, conversations SAV, renouvellements, avenants, multi-agences, transferts de stock corrélés, sécurité des comptes et socle d’abonnement SaaS |
| Production Vercel | déploiement prêt, alias public actif, landing et authentification vérifiées dans Chromium |
| Connexion production | création d’un compte QA, fermeture de session, reconnexion par mot de passe puis suppression ciblée du compte réussies |
| Smoke PostgreSQL métier | séquence, inscription, workflow et exécution créés et relus |
| `/v2` | réponse HTTP 404 vérifiée |
| Export précomptable | archive ZIP et signature `PK` vérifiées en E2E |
| Export de réversibilité | schéma v4, manifeste SHA-256 et absence de secrets contrôlés en E2E |
| Recherche de secrets versionnés | aucune clé privée ou clé fournisseur détectée ; uniquement des placeholders documentés |
| `git diff --check` | aucun défaut d’espace ou de marqueur de conflit |

## Parcours navigateur couverts

- création d’un compte propriétaire et connexion de production par mot de passe, plus maintien du lien magique optionnel ;
- landing Freelio restaurée, page Produit et section workflow animée, avec `/v2` toujours absente ;
- facturation récurrente, banque, organisation, migration, clients, projets et relevé technique ;
- devis et aperçu PDF ;
- création de modèle e-mail, séquence, étape et règle événementielle ;
- studio d’automatisation maître-détail avec vue d’ensemble, audience consentie, modèles, séquences, workflows et journal filtrable ;
- cadence de séquence avec jours ouvrés, fenêtre horaire, fuseau et métriques de livraison/ouverture/clic/erreur par étape ;
- étape d’appel issue d’une séquence, tâche créée dans Organisation, pause de l’inscription, réalisation puis reprise/fin automatique vérifiées en navigateur ;
- workflow conditionnel créé en brouillon, publication versionnée et simulation sans effet avec trace du chemin et actions prévues ;
- aperçu HTML isolé, boîte e-mail CRM, statistiques et écrans d’intégration sans faux statut actif ;
- scoring explicable, règles personnalisées, file priorisée et segments actifs/statiques ;
- capture publique d’un prospect avec consentement ;
- inscription automatique à la séquence ;
- génération du lien de désinscription, retrait public et relecture idempotente ;
- arrêt de l’inscription et passage du contact en opposition ;
- devis vers commande, facture de solde, réservation puis consommation du stock ;
- opportunité attribuée, forecast pondéré, clôture prévue et perte avec motif obligatoire ;
- fiche opportunité reliée au client, devis, chantiers, interlocuteurs et chronologie ; ajout d'activité répliqué dans l'historique client ;
- gamme configurable, option obligatoire, supplément vente/coût, nomenclature, remise et devis recalculé côté serveur ;
- commande fournisseur multi-lignes, approbation séparée, PDF, envoi, accusé et date confirmée ;
- dossiers fournisseur et commande avec ponctualité, catalogue, reliquats, cycle d'approbation, réceptions, anomalies et retours ;
- réception partielle puis finale, ligne libre sans mouvement de stock, non-conformité, avoir, retour physique et avoir du retour ;
- création d’une agence, rattachement d’un dépôt, transfert de stock aller/retour entre deux dépôts et filtre opérationnel par agence ;
- création, signature scellée et lecture PDF d’un bon de livraison ;
- espace terrain installable, rechargement hors ligne depuis un cache borné à 24 heures et file locale de synchronisation ;
- clôture terrain atomique et rejouable avec photo, stock, frais et justificatif, réserve, signature manuscrite, coût réel, résolution et PDF ;
- photo d’intervention contrôlée, clôture avec preuve client et lecture du rapport PDF ;
- help desk avec files filtrables, charge, délais de résolution testés, et dossiers liés ticket/intervention/équipement validés sur desktop et mobile ;
- fil e-mail client rattaché au ticket, message entrant visible et note interne séparée, validés sur desktop puis relus sur mobile ;
- base de connaissances avec aperçu HTML assaini, publication interne/portail et fiche d'aide protégée par la session client ;
- enquêtes CSAT/NPS/CES, invitation publique à jeton hashé et expirant, réponse atomique, verbatim et indicateurs ; parcours article → enquête → réponse → tableau Service validé en navigateur ;
- coût horaire, sortie de matériel liée à l’intervention, coût réel et fournitures du rapport client ;
- capacité hebdomadaire d’équipe, création d’un contrat d’entretien, visite et facture automatiques avec second passage idempotent ;
- proposition de renouvellement d’entretien, envoi à la signature, accord public puis création du nouveau terme historisé ;
- contrat signé conservé sans mutation, avenant structuré avant/après, impact financier, PDF et traçabilité source/avenant ;
- modèle de chantier multi-étapes, budget/dates par défaut, dépendance obligatoire et progression après prérequis ;
- replanification terrain, vue de tournée et refus explicite d’un chevauchement pour le même intervenant ;
- export calendrier, export comptable, export de réversibilité et suppression effective de la landing `/v2` ;
- surfaces principales et navigation pipeline sur viewport mobile.
- portail client temporaire/révocable avec suivi de dossier, PDF, messages et demandes de rendez-vous ; révocation vérifiée depuis une nouvelle session anonyme.

## Invariants vérifiés dans le code et les tests

- isolement société direct et relationnel, classification exhaustive des modèles Prisma, opérations de lecture/agrégation cloisonnées et permissions par rôle/domaines ;
- traitement manuel des échéances borné à la société authentifiée, rate limit dédié et séquence active obligatoire à l’inscription ;
- jetons de signature/désinscription signés et secrets hors URL en clair ;
- désinscription marketing idempotente et prioritaire sur les séquences ;
- contenu e-mail assaini, variables échappées, `List-Unsubscribe` one-click et clé d’idempotence Resend ;
- verrou d’envoi persistant avec reprise après expiration ;
- règles CRM idempotentes par clé d’événement ;
- arrêt des séquences sur réponse entrante et déclencheurs e-mail/portail/intervention ;
- mot de passe scrypt salé, récupération à jeton hashé/expirable, MFA TOTP avec codes de secours hashés, révocation versionnée de tous les JWT et compte créé sans identité d’entreprise codée en dur ;
- jetons de portail conservés uniquement sous forme hashée, retirés de l’URL après activation et révocables ;
- exports tableur protégés contre l’injection de formule ;
- journal précomptable équilibré et explicitement non présenté comme FEC ;
- sauvegarde applicative sans IBAN chiffré, identifiants de connexion, secrets webhook, invitations ou jetons de signature ;
- migrations HubSpot/Extrabat rejouables avec identifiants externes, archives et rapprochement technique.
- IBAN chiffré en AES-GCM avec enveloppe versionnée, réécriture des valeurs historiques et déchiffrement limité aux rendus autorisés.
- abonnement Stripe par entreprise, quotas membres/agences côté serveur, webhook signé/idempotent avec empreinte et rétention bornée.
- sauvegarde logique quotidienne compressée/chiffrée dans R2, commande de déchiffrement hors production et contrôle du manifeste avant écriture.
- acceptation des conditions et de la confidentialité horodatée/versionnée, CSP stricte sur les espaces sensibles et métriques Vercel limitées à l’hébergement Vercel.
- engagements de résolution SAV déterministes par priorité, échéance manuelle prioritaire et ticket clos exclu des dépassements.
- contenu de connaissance assaini côté serveur, articles portail bornés à la société et réponses de satisfaction à usage unique.
- rattachement d’un fil e-mail refusé entre deux clients ou lorsqu’il appartient déjà à un autre ticket ; notes internes isolées par société et auteur.
- vues persistées bornées à la société et au membre, configuration JSON validée côté serveur et réapplication après rechargement.
- migration du catalogue existant avec reprise automatique des prix achat/vente dans deux périodes historiques.
- migration du workflow achats avec conservation des réceptions historiques et rétroalimentation de leur quantité acceptée.
- migration des modèles et dépendances de chantier avec conservation d’un projet et d’un jalon historiques.
- transfert inter-dépôts atomique, quantité totale conservée, coût figé et impossibilité de déplacer du stock indisponible ou réservé.
- périmètre d’agence résolu à chaque action : Owner/Admin globaux, autres rôles limités aux affectations actives, avec lecture et mutation inter-agences refusées au niveau Prisma.

## Gates externes avant résiliation

Les éléments suivants ne peuvent pas être prouvés par le dépôt seul :

1. inventaire des modules, workflows, listes, campagnes, boîtes et personnalisations réellement utilisés dans les deux comptes ;
2. restitution Extrabat structurée et GED complète, ou documentation/API autorisée du compte ;
3. deux migrations générales identiques puis delta final, avec volumes, montants, relations, stock et documents signés ;
4. préproduction et production PostgreSQL/R2/Redis/Upstash/Resend, sauvegardes natives, PITR, supervision et restauration mesurée ;
5. domaine e-mail vérifié, SPF/DKIM/DMARC et test réel de délivrabilité/désinscription ;
6. plateforme agréée de facturation électronique et format validé par le cabinet comptable ;
7. autorisation et recette des boîtes/calendriers Google ou Microsoft réellement utilisés, ou décision formelle de rester sur le canal Resend ;
8. décision sur les écarts encore partiels : campagnes de masse, live chat/social/publicité, workflows à branches complexes et optimisation routière ;
9. recette de dix dossiers réels, deux cycles opérationnels complets et procès-verbal de go/no-go du gérant.
10. Vercel Pro ou ordonnanceur externe supervisé pour exécuter les automatisations toutes les cinq minutes et les échéances horaires ; Vercel Hobby ne permet que le cron quotidien de sauvegarde.

La procédure et les responsables attendus sont décrits dans le [runbook de migration](migration-cutover-runbook.md), le [runbook de production](production-runbook.md) et la [matrice de couverture](coverage-and-external-dependencies.md).
