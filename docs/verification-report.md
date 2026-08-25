# Rapport de vérification du candidat CRM/ERP

Date : 25 août 2026
Branche : `codex/diskoov-crm-replacement`
Portée : code et bases de recette locales ; les comptes HubSpot/Extrabat et l’infrastructure de production ne sont pas inclus.

## Résultat synthétique

Le candidat du dépôt est cohérent, compilable et déployable sur une base PostgreSQL vierge. Les flux centraux CRM, vente, opérations, finance, migration, séquences e-mail et réversibilité ont des preuves automatisées. La résiliation réelle de HubSpot et Extrabat demeure un **no-go** tant que les exports réels, rapprochements, répétitions, services de production et décisions métier de la matrice de couverture ne sont pas signés.

## Preuves exécutées

| Contrôle | Résultat |
|---|---|
| `npm run db:generate` | clients SQLite et PostgreSQL générés |
| `npm run typecheck` | réussi |
| `npm run lint` | réussi |
| `npm run test:unit` | 25 fichiers, 88 tests réussis |
| `npm run build` | build Next.js de production réussi, 39 pages statiques/dynamiques générées |
| `npm audit --audit-level=high` | 0 vulnérabilité déclarée |
| Playwright, base SQLite neuve | 11 scénarios réussis, 7 mutations volontairement ignorées sur mobile après validation desktop (18 exécutions) |
| PostgreSQL 18 vierge | 10 migrations appliquées, aucune divergence avec le schéma Prisma |
| PostgreSQL 18 historique | chantier et jalon antérieurs conservés, nouvelles valeurs par défaut vérifiées et schéma final sans divergence |
| Smoke PostgreSQL métier | séquence, inscription, workflow et exécution créés et relus |
| `/v2` | réponse HTTP 404 vérifiée |
| Export précomptable | archive ZIP et signature `PK` vérifiées en E2E |
| Export de réversibilité | schéma v4, manifeste SHA-256 et absence de secrets contrôlés en E2E |
| Recherche de secrets versionnés | aucune clé privée ou clé fournisseur détectée ; uniquement des placeholders documentés |
| `git diff --check` | aucun défaut d’espace ou de marqueur de conflit |

## Parcours navigateur couverts

- connexion de développement et chargement sans erreur console ;
- landing Freelio restaurée, page Produit et section workflow animée, avec `/v2` toujours absente ;
- facturation récurrente, banque, organisation, migration, clients, projets et relevé technique ;
- devis et aperçu PDF ;
- création de modèle e-mail, séquence, étape et règle événementielle ;
- capture publique d’un prospect avec consentement ;
- inscription automatique à la séquence ;
- génération du lien de désinscription, retrait public et relecture idempotente ;
- arrêt de l’inscription et passage du contact en opposition ;
- devis vers commande, facture de solde, réservation puis consommation du stock ;
- opportunité attribuée, forecast pondéré, clôture prévue et perte avec motif obligatoire ;
- gamme configurable, option obligatoire, supplément vente/coût, nomenclature, remise et devis recalculé côté serveur ;
- commande fournisseur multi-lignes, approbation séparée, PDF, envoi, accusé et date confirmée ;
- réception partielle puis finale, ligne libre sans mouvement de stock, non-conformité, avoir, retour physique et avoir du retour ;
- création, signature scellée et lecture PDF d’un bon de livraison ;
- espace terrain installable, rechargement hors ligne depuis un cache borné à 24 heures et file locale de synchronisation ;
- photo d’intervention contrôlée, clôture avec preuve client et lecture du rapport PDF ;
- coût horaire, sortie de matériel liée à l’intervention, coût réel et fournitures du rapport client ;
- capacité hebdomadaire d’équipe, création d’un contrat d’entretien, visite et facture automatiques avec second passage idempotent ;
- modèle de chantier multi-étapes, budget/dates par défaut, dépendance obligatoire et progression après prérequis ;
- replanification terrain, vue de tournée et refus explicite d’un chevauchement pour le même intervenant ;
- export calendrier, export comptable, export de réversibilité et suppression effective de la landing `/v2` ;
- surfaces principales et navigation pipeline sur viewport mobile.

## Invariants vérifiés dans le code et les tests

- isolement société et permissions par rôle/domaines ;
- jetons de signature/désinscription signés et secrets hors URL en clair ;
- désinscription marketing idempotente et prioritaire sur les séquences ;
- contenu e-mail assaini, variables échappées, `List-Unsubscribe` one-click et clé d’idempotence Resend ;
- verrou d’envoi persistant avec reprise après expiration ;
- règles CRM idempotentes par clé d’événement ;
- exports tableur protégés contre l’injection de formule ;
- journal précomptable équilibré et explicitement non présenté comme FEC ;
- sauvegarde applicative sans IBAN chiffré, identifiants de connexion, secrets webhook, invitations ou jetons de signature ;
- migrations HubSpot/Extrabat rejouables avec identifiants externes, archives et rapprochement technique.
- migration du catalogue existant avec reprise automatique des prix achat/vente dans deux périodes historiques.
- migration du workflow achats avec conservation des réceptions historiques et rétroalimentation de leur quantité acceptée.
- migration des modèles et dépendances de chantier avec conservation d’un projet et d’un jalon historiques.

## Gates externes avant résiliation

Les éléments suivants ne peuvent pas être prouvés par le dépôt seul :

1. inventaire des modules, workflows, listes, campagnes, boîtes et personnalisations réellement utilisés dans les deux comptes ;
2. restitution Extrabat structurée et GED complète, ou documentation/API autorisée du compte ;
3. deux migrations générales identiques puis delta final, avec volumes, montants, relations, stock et documents signés ;
4. préproduction et production PostgreSQL/R2/Redis/Upstash/Resend, sauvegardes natives, PITR, supervision et restauration mesurée ;
5. domaine e-mail vérifié, SPF/DKIM/DMARC et test réel de délivrabilité/désinscription ;
6. plateforme agréée de facturation électronique et format validé par le cabinet comptable ;
7. décision sur les écarts encore partiels : boîte e-mail, calendrier bidirectionnel, campagnes de masse, optimisation routière, signature manuscrite, pièces/frais SAV et portail client ;
8. recette de dix dossiers réels, deux cycles opérationnels complets et procès-verbal de go/no-go du gérant.

La procédure et les responsables attendus sont décrits dans le [runbook de migration](migration-cutover-runbook.md), le [runbook de production](production-runbook.md) et la [matrice de couverture](coverage-and-external-dependencies.md).
