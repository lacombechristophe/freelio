# Plan de durcissement SaaS production

Dernière mise à jour : 31 août 2026.

## Objectif et règle de sortie

Le produit doit pouvoir remplacer les usages CRM/ERP d’un pisciniste sans dépendre de HubSpot ou d’Extrabat pour son exploitation quotidienne. Une phase n’est terminée que lorsque le code, les tests, l’exploitation et les dépendances externes sont vérifiés ensemble. Une interface présente ne constitue pas à elle seule une fonctionnalité terminée.

## 1. Frontière de sécurité multi-tenant

- Toutes les tables portant `companyId` sont filtrées automatiquement par le contexte authentifié.
- Un test compare la liste de protection au schéma Prisma et bloque toute dérive future.
- Les accès agence/dépôt restent une seconde frontière, sous l’entreprise.
- Les champs sensibles sont chiffrés, jamais sérialisés dans un DTO générique, et les secrets ne figurent pas dans les exports.
- Les actions à risque exigent une permission explicite et sont journalisées.

Critère de sortie : tests d’isolation verts, aucun modèle direct oublié, aucune donnée sensible en clair après réécriture.

## 2. Socle SaaS commercial

- Abonnement par entreprise, état, période, résiliation, capacité membres/agences.
- Checkout et portail client Stripe ; aucun droit accordé à partir du seul retour navigateur.
- Webhook signé, idempotent, relançable et journalisé par empreinte.
- Quotas vérifiés côté serveur avant invitation, création ou réactivation.
- Acceptation des conditions et de la confidentialité horodatée et versionnée.

Critère de sortie : clés/prix/webhook Stripe configurés, événements test et live rapprochés, portail activé, factures Stripe vérifiées.

## 3. Continuité et traitements asynchrones

- Automatisations, séquences, échéances métier et sauvegardes déclenchées par Vercel Cron en GET authentifié.
- Sauvegarde logique quotidienne compressée, chiffrée et écrite dans R2 hors du chemin de rendu.
- La restauration reste une procédure contrôlée ; la restauration PostgreSQL point-in-time du fournisseur demeure le premier niveau de reprise.
- Chaque traitement est borné, idempotent et produit un résumé exploitable.

Critère de sortie : trois exécutions consécutives observées, restauration testée sur environnement isolé, RPO/RTO contractuels définis.

## 4. Observabilité et performance

- OpenTelemetry serveur, erreurs Next globales, métriques Vercel, Core Web Vitals et journaux structurés sans secrets.
- Routes de vivacité et de disponibilité séparées ; la disponibilité échoue si une dépendance obligatoire manque.
- Budget de performance : aucun chargement de base ou export lourd dans les layouts, pagination sur les listes, bundles surveillés.

Critère de sortie : alertes configurées, test d’incident exécuté, p95 et taux d’erreur suivis sur une période représentative.

## 5. Produit et expérience

- Navigation par espaces CRM, marketing, ventes, opérations, service, revenus, données et reporting.
- États vides, chargements, erreurs récupérables, aide contextuelle, aperçus HTML/PDF et actions suivantes explicites.
- Accessibilité clavier, libellés des icônes, cibles tactiles, contrastes et responsive vérifiés.
- Aucune promesse marketing d’hébergement, certification ou conformité non démontrée.

Critère de sortie : parcours propriétaire, commercial, technicien et SAV testés de bout en bout sur mobile et desktop.

## 6. Migration HubSpot et Extrabat

- Connecteurs API quand les droits et contrats sources le permettent ; archives CSV/ZIP comme voie de secours.
- Conservation des sources, correspondance d’identifiants, pièces jointes, historique, statistiques et rapport d’écarts.
- Import d’essai, rapprochement métier, gel des sources, delta final puis validation signée avant résiliation.

Critère de sortie : totaux par objet rapprochés, échantillons fonctionnels validés, pièces vérifiées par empreinte, plan de retour documenté.

## 7. Prérequis externes bloquants avant ouverture commerciale

- Renseigner Resend, R2, Upstash, Stripe et `CRON_SECRET` dans Vercel.
- Activer Vercel Pro ou un ordonnanceur externe supervisé pour les automatisations toutes les cinq minutes et les échéances horaires ; l’offre Hobby n’accepte que la sauvegarde quotidienne.
- Activer sauvegarde/PITR PostgreSQL, politique de rétention R2 et alertes Vercel.
- Faire valider CGU, politique de confidentialité, DPA, sous-traitants, mentions légales et durées de conservation.
- Tester le domaine d’envoi (SPF, DKIM, DMARC), les rebonds/plaintes et le désabonnement.
- Réaliser un test de restauration, un test de charge et une revue de sécurité externe avant données réelles.
